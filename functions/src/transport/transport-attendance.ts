import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import {
  OperationalAssignmentSchema,
  StudentTransportEnrollmentSchema,
  TransportAttendanceBatchSchema,
  TransportRouteSchema,
  type MembershipRole,
  type OperationalAssignment,
  type StudentTransportEnrollment,
  type TransportAttendanceBatch,
  type TransportAttendanceBatchStudentRow,
  type TransportRoute,
  type TransportTripKind,
} from "@takween/contracts";
import {
  buildTransportAttendanceRecordsFromBatch,
  calculateTransportBatchSummary,
  getRouteTransportEnrollments,
  isStatusAllowedForTransportTrip,
  resolveTransportBatchStatus,
  submitTransportAttendanceBatch,
} from "@takween/domain";

import { WEB_STAFF_CORS_ORIGINS } from "../shared/cors";

const REGION = "me-central2";
const MAX_ATOMIC_SUBMISSION_ROWS = 450;
const EDITABLE_BATCH_STATUSES = new Set(["DRAFT", "IN_PROGRESS"]);
const ORG_WIDE_ROLES = new Set([
  "platform_owner",
  "platform_admin",
  "org_owner",
  "org_admin",
]);
const SCHOOL_LEADERSHIP_ROLES = new Set([
  "school_admin",
  "school_manager",
  "BOYS_PRINCIPAL",
  "GIRLS_PRINCIPAL",
  "KG_PRINCIPAL",
  "BOYS_VP",
  "BOYS_EDU_VP",
  "BOYS_STUDENTS_VP",
  "BOYS_TEACHERS_VP",
  "GIRLS_VP",
  "KG_VP",
]);

type RecordData = Record<string, unknown>;
type TransportPermission = "VIEW" | "CREATE" | "UPDATE_DRAFT" | "SUBMIT";

type TransportActor = {
  uid: string;
  orgId: string;
  personId: string;
  roleKey?: MembershipRole;
  isOrgWide: boolean;
  leadershipSchoolIds: Set<string>;
  assignments: OperationalAssignment[];
};

function record(value: unknown): RecordData {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordData)
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && !!item.trim())
    : [];
}

function requireId(value: unknown, fieldName: string) {
  const result = text(value);
  if (!result || result.includes("/")) {
    throw new HttpsError("invalid-argument", `${fieldName} is required.`);
  }
  return result;
}

function requireServiceDate(value: unknown) {
  const result = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) {
    throw new HttpsError("invalid-argument", "serviceDate must use YYYY-MM-DD.");
  }
  const [year, month, day] = result.split("-").map(Number);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  if (
    calendarDate.getUTCFullYear() !== year ||
    calendarDate.getUTCMonth() !== month - 1 ||
    calendarDate.getUTCDate() !== day
  ) {
    throw new HttpsError("invalid-argument", "serviceDate is invalid.");
  }
  const timestamp = Date.parse(`${result}T00:00:00+03:00`);
  if (!Number.isFinite(timestamp)) {
    throw new HttpsError("invalid-argument", "serviceDate is invalid.");
  }
  return result;
}

function canonicalBatchId(params: {
  routeId: string;
  serviceDate: string;
  tripKind: TransportTripKind;
}) {
  return `transport-batch_${params.routeId}_${params.serviceDate}_${params.tripKind.toLowerCase()}`;
}

function isActive(data: RecordData, now: number) {
  if (data.isActive === false || data.active === false) return false;
  if (data.status && data.status !== "ACTIVE") return false;
  if (typeof data.startAt === "number" && data.startAt > now) return false;
  if (typeof data.endAt === "number" && data.endAt < now) return false;
  return true;
}

function cleanForFirestore<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function setsEqual(first: readonly string[], second: readonly string[]) {
  if (first.length !== second.length) return false;
  const values = new Set(first);
  return second.every((item) => values.has(item));
}

function parseRoute(id: string, data: RecordData): TransportRoute {
  const parsed = TransportRouteSchema.safeParse({ id, ...data });
  if (!parsed.success) {
    throw new HttpsError("data-loss", `Transport route ${id} is invalid.`);
  }
  return parsed.data;
}

function parseBatch(id: string, data: RecordData): TransportAttendanceBatch {
  const parsed = TransportAttendanceBatchSchema.safeParse({ id, ...data });
  if (!parsed.success) {
    throw new HttpsError("data-loss", `Transport batch ${id} is invalid.`);
  }
  return parsed.data;
}

function tryParseRoute(id: string, data: RecordData) {
  const parsed = TransportRouteSchema.safeParse({ id, ...data });
  return parsed.success ? parsed.data : undefined;
}

function tryParseBatch(id: string, data: RecordData) {
  const parsed = TransportAttendanceBatchSchema.safeParse({ id, ...data });
  return parsed.success ? parsed.data : undefined;
}

async function resolveActor(uid: string, orgId: string): Promise<TransportActor> {
  const db = getFirestore();
  const [membershipSnapshot, userSnapshot] = await Promise.all([
    db.doc(`users/${uid}/orgMemberships/${orgId}`).get(),
    db.doc(`users/${uid}`).get(),
  ]);
  if (!membershipSnapshot.exists) {
    throw new HttpsError("permission-denied", "Active organization membership is required.");
  }

  const now = Date.now();
  const membership = record(membershipSnapshot.data());
  if (!isActive(membership, now)) {
    throw new HttpsError("permission-denied", "Active organization membership is required.");
  }
  const user = record(userSnapshot.data());
  const personId = text(membership.personId) || text(user.personId);
  if (!personId) {
    throw new HttpsError("failed-precondition", "The signed-in staff account is not linked to a person.");
  }

  const rawRoleKey = text(membership.roleKey) || text(membership.role);
  const roleKey = rawRoleKey ? (rawRoleKey as MembershipRole) : undefined;
  const scopes = record(membership.scopes);
  const permissions = record(membership.permissions);
  const isOrgWide =
    (!!roleKey && ORG_WIDE_ROLES.has(roleKey)) ||
    scopes.canAccessAllSchools === true ||
    permissions.manageOrg === true ||
    permissions.manageSchools === true;
  const leadershipSchoolIds = new Set<string>();
  if (roleKey && SCHOOL_LEADERSHIP_ROLES.has(roleKey)) {
    stringArray(scopes.schoolIds).forEach((schoolId) => leadershipSchoolIds.add(schoolId));
    if (membership.scopeType === "SCHOOL" && text(membership.scopeId)) {
      leadershipSchoolIds.add(text(membership.scopeId));
    }
  }

  const assignmentsSnapshot = await db
    .collection(`orgs/${orgId}/operationalAssignments`)
    .where("actorPersonId", "==", personId)
    .get();
  const assignments = assignmentsSnapshot.docs.flatMap((document) => {
    const parsed = OperationalAssignmentSchema.safeParse({
      id: document.id,
      ...document.data(),
    });
    return parsed.success && isActive(record(parsed.data), now) ? [parsed.data] : [];
  });

  return {
    uid,
    orgId,
    personId,
    roleKey,
    isOrgWide,
    leadershipSchoolIds,
    assignments,
  };
}

function matchingAssignment(
  actor: TransportActor,
  route: TransportRoute,
  permission: TransportPermission,
) {
  return actor.assignments.find((assignment) => {
    if (assignment.operationKind !== "TRANSPORT_ATTENDANCE") return false;
    const permissions = assignment.permissions?.length
      ? assignment.permissions
      : ["VIEW", "CREATE", "UPDATE_DRAFT", "SUBMIT"];
    if (!permissions.includes(permission)) return false;
    return (
      (assignment.scopeType === "ROUTE" && assignment.scopeId === route.id) ||
      assignment.targetRouteIds.includes(route.id)
    );
  });
}

function authorizeRoute(
  actor: TransportActor,
  route: TransportRoute,
  permission: TransportPermission,
) {
  if (route.orgId !== actor.orgId || route.status !== "ACTIVE" || route.isArchived === true) {
    throw new HttpsError("permission-denied", "Transport route is outside your active scope.");
  }
  if (actor.isOrgWide) return undefined;
  if (route.schoolId && actor.leadershipSchoolIds.has(route.schoolId)) return undefined;
  const assignment = matchingAssignment(actor, route, permission);
  if (assignment) return assignment;
  if (route.supervisorPersonIds?.includes(actor.personId)) return undefined;
  throw new HttpsError("permission-denied", "You are not assigned to this transport route.");
}

async function getVisibleRoutes(actor: TransportActor) {
  const db = getFirestore();
  const collection = db.collection(`orgs/${actor.orgId}/transportRoutes`);
  let documents: FirebaseFirestore.QueryDocumentSnapshot[] = [];

  if (actor.isOrgWide) {
    documents = (await collection.get()).docs;
  } else {
    const assignmentRouteIds = Array.from(
      new Set(
        actor.assignments
          .filter((assignment) => assignment.operationKind === "TRANSPORT_ATTENDANCE")
          .filter((assignment) => assignment.permissions.includes("VIEW"))
          .flatMap((assignment) => [
            assignment.scopeType === "ROUTE" ? assignment.scopeId : "",
            ...assignment.targetRouteIds,
          ])
          .filter(Boolean),
      ),
    );
    const [assignedDocuments, supervisorSnapshot, leadershipSnapshots] =
      await Promise.all([
        assignmentRouteIds.length
          ? db.getAll(...assignmentRouteIds.map((routeId) => collection.doc(routeId)))
          : Promise.resolve([]),
        collection.where("supervisorPersonIds", "array-contains", actor.personId).get(),
        Promise.all(
          Array.from(actor.leadershipSchoolIds).map((schoolId) =>
            collection.where("schoolId", "==", schoolId).get(),
          ),
        ),
      ]);
    const documentMap = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
    assignedDocuments.forEach((document) => {
      if (document.exists) {
        documentMap.set(document.id, document as FirebaseFirestore.QueryDocumentSnapshot);
      }
    });
    [...supervisorSnapshot.docs, ...leadershipSnapshots.flatMap((item) => item.docs)].forEach(
      (document) => documentMap.set(document.id, document),
    );
    documents = Array.from(documentMap.values());
  }

  return documents
    .flatMap((document) => {
      const route = tryParseRoute(document.id, document.data());
      return route ? [route] : [];
    })
    .filter((route) => {
      try {
        authorizeRoute(actor, route, "VIEW");
        return true;
      } catch {
        return false;
      }
    })
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.title.localeCompare(b.title, "ar"));
}

async function getRouteAndAuthorize(params: {
  actor: TransportActor;
  routeId: string;
  permission: TransportPermission;
}) {
  const snapshot = await getFirestore()
    .doc(`orgs/${params.actor.orgId}/transportRoutes/${params.routeId}`)
    .get();
  if (!snapshot.exists) throw new HttpsError("not-found", "Transport route was not found.");
  const route = parseRoute(snapshot.id, snapshot.data() ?? {});
  const assignment = authorizeRoute(params.actor, route, params.permission);
  return { route, assignment };
}

function parseEnrollments(snapshot: FirebaseFirestore.QuerySnapshot) {
  return snapshot.docs.flatMap((document) => {
    const parsed = StudentTransportEnrollmentSchema.safeParse({
      id: document.id,
      ...document.data(),
    });
    return parsed.success ? [parsed.data] : [];
  });
}

function activeEnrollments(params: {
  route: TransportRoute;
  enrollments: StudentTransportEnrollment[];
  serviceDate: string;
}) {
  const enrollments = getRouteTransportEnrollments({
    orgId: params.route.orgId,
    schoolId: params.route.schoolId,
    academicYearId: params.route.academicYearId,
    routeId: params.route.id,
    enrollments: params.enrollments,
    serviceDate: params.serviceDate,
  });
  const studentIds = enrollments.map((item) => item.studentId);
  if (new Set(studentIds).size !== studentIds.length) {
    throw new HttpsError(
      "failed-precondition",
      "More than one active transport enrollment exists for a student on this route.",
    );
  }
  return enrollments;
}

function stopForTrip(enrollment: StudentTransportEnrollment, tripKind: TransportTripKind) {
  return tripKind === "AFTERNOON_DROPOFF"
    ? { stopId: enrollment.dropoffStopId, stopTitle: enrollment.dropoffStopTitle }
    : { stopId: enrollment.pickupStopId, stopTitle: enrollment.pickupStopTitle };
}

function buildAuthoritativeRows(params: {
  incoming: TransportAttendanceBatch;
  existing?: TransportAttendanceBatch;
  enrollments: StudentTransportEnrollment[];
  actorPersonId: string;
  now: number;
}) {
  const incomingByStudent = new Map(
    params.incoming.studentRows.map((row) => [row.studentId, row]),
  );
  const existingByStudent = new Map(
    (params.existing?.studentRows ?? []).map((row) => [row.studentId, row]),
  );
  const activeStudentIds = params.enrollments.map((item) => item.studentId);
  if (
    !setsEqual(params.incoming.targetStudentIds, activeStudentIds) ||
    !setsEqual(params.incoming.studentRows.map((row) => row.studentId), activeStudentIds)
  ) {
    throw new HttpsError(
      "failed-precondition",
      "The active transport enrollment list changed. Reload the trip before saving.",
    );
  }

  return params.enrollments.map((enrollment): TransportAttendanceBatchStudentRow => {
    const incoming = incomingByStudent.get(enrollment.studentId);
    if (!incoming) {
      throw new HttpsError("failed-precondition", "A target student row is missing.");
    }
    if (
      !isStatusAllowedForTransportTrip({
        tripKind: params.incoming.tripKind,
        status: incoming.status,
      })
    ) {
      throw new HttpsError("invalid-argument", "A student status is not valid for this trip.");
    }
    const previous = existingByStudent.get(enrollment.studentId);
    const note = text(incoming.note).slice(0, 1000) || undefined;
    const changed = !previous || previous.status !== incoming.status || text(previous.note) !== text(note);
    const stop = stopForTrip(enrollment, params.incoming.tripKind);
    return {
      studentId: enrollment.studentId,
      studentPersonId: enrollment.studentPersonId,
      studentDisplayName: enrollment.studentDisplayName ?? enrollment.studentId,
      enrollmentId: enrollment.id,
      status: incoming.status,
      stopId: stop.stopId,
      stopTitle: stop.stopTitle,
      recordedAt: incoming.status === "PENDING" ? undefined : changed ? params.now : previous?.recordedAt,
      recordedByPersonId:
        incoming.status === "PENDING"
          ? undefined
          : changed
            ? params.actorPersonId
            : previous?.recordedByPersonId ?? params.actorPersonId,
      note,
      recordId: previous?.recordId,
    };
  });
}

async function currentTerm(orgId: string, academicYearId: string) {
  if (!academicYearId) return undefined;
  const snapshot = await getFirestore()
    .collection(`orgs/${orgId}/academicYears/${academicYearId}/terms`)
    .where("isCurrent", "==", true)
    .limit(1)
    .get();
  const document = snapshot.docs[0];
  if (!document) return undefined;
  const data = record(document.data());
  return {
    termId: document.id,
    termTitle: text(data.title) || undefined,
    termShortTitle: text(data.shortTitle) || undefined,
  };
}

export const getTransportAccessSummary = onCall(
  { region: REGION, cors: WEB_STAFF_CORS_ORIGINS },
  async (request): Promise<{ hasAccess: boolean }> => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Authentication is required.");
    const orgId = requireId(record(request.data).orgId, "orgId");
    const actor = await resolveActor(uid, orgId);
    const routes = await getVisibleRoutes(actor);
    return { hasAccess: routes.length > 0 };
  },
);

export const getTransportWorkspace = onCall(
  { region: REGION, cors: WEB_STAFF_CORS_ORIGINS, memory: "512MiB" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Authentication is required.");
    const input = record(request.data);
    const orgId = requireId(input.orgId, "orgId");
    const actor = await resolveActor(uid, orgId);
    let routeId = text(input.routeId);
    let requestedBatch: TransportAttendanceBatch | undefined;

    if (input.batchId) {
      const batchId = requireId(input.batchId, "batchId");
      const batchSnapshot = await getFirestore()
        .doc(`orgs/${orgId}/transportAttendanceBatches/${batchId}`)
        .get();
      if (!batchSnapshot.exists) throw new HttpsError("not-found", "Transport batch was not found.");
      requestedBatch = parseBatch(batchSnapshot.id, batchSnapshot.data() ?? {});
      if (requestedBatch.orgId !== orgId) {
        throw new HttpsError("data-loss", "Transport batch organization is invalid.");
      }
      routeId = requestedBatch.routeId;
    }

    const routes = routeId
      ? [(await getRouteAndAuthorize({ actor, routeId: requireId(routeId, "routeId"), permission: "VIEW" })).route]
      : await getVisibleRoutes(actor);

    const routeData = await Promise.all(
      routes.map(async (route) => {
        const [enrollmentsSnapshot, batchesSnapshot] = await Promise.all([
          getFirestore()
            .collection(`orgs/${orgId}/studentTransportEnrollments`)
            .where("routeId", "==", route.id)
            .get(),
          getFirestore()
            .collection(`orgs/${orgId}/transportAttendanceBatches`)
            .where("routeId", "==", route.id)
            .get(),
        ]);
        return {
          enrollments: parseEnrollments(enrollmentsSnapshot),
          batches: batchesSnapshot.docs
            .flatMap((document) => {
              const batch = tryParseBatch(document.id, document.data());
              return batch ? [batch] : [];
            })
            .filter(
              (batch) => batch.orgId === orgId && batch.routeId === route.id,
            ),
        };
      }),
    );

    return {
      routes,
      enrollments: routeData.flatMap((item) => item.enrollments),
      batches: routeData
        .flatMap((item) => item.batches)
        .sort((a, b) => b.serviceDate.localeCompare(a.serviceDate) || b.updatedAt - a.updatedAt),
      batch: requestedBatch,
    };
  },
);

export const saveTransportAttendanceDraft = onCall(
  { region: REGION, cors: WEB_STAFF_CORS_ORIGINS, memory: "512MiB" },
  async (request): Promise<TransportAttendanceBatch> => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Authentication is required.");
    const input = record(request.data);
    const orgId = requireId(input.orgId, "orgId");
    const parsedIncoming = TransportAttendanceBatchSchema.safeParse(input.batch);
    if (!parsedIncoming.success || parsedIncoming.data.orgId !== orgId) {
      throw new HttpsError("invalid-argument", "Transport draft payload is invalid.");
    }
    const incoming = parsedIncoming.data;
    const serviceDate = requireServiceDate(incoming.serviceDate);
    const expectedUpdatedAt =
      typeof input.expectedUpdatedAt === "number" ? input.expectedUpdatedAt : undefined;
    const actor = await resolveActor(uid, orgId);
    const { route } = await getRouteAndAuthorize({
      actor,
      routeId: incoming.routeId,
      permission: "VIEW",
    });
    const expectedBatchId = canonicalBatchId({
      routeId: route.id,
      serviceDate,
      tripKind: incoming.tripKind,
    });
    if (incoming.id !== expectedBatchId) {
      throw new HttpsError("invalid-argument", "Transport batch ID is not canonical.");
    }
    const term = await currentTerm(orgId, route.academicYearId ?? "");
    const db = getFirestore();
    const batchRef = db.doc(`orgs/${orgId}/transportAttendanceBatches/${expectedBatchId}`);

    return db.runTransaction(async (transaction) => {
      const [existingSnapshot, routeSnapshot, enrollmentsSnapshot] = await Promise.all([
        transaction.get(batchRef),
        transaction.get(db.doc(`orgs/${orgId}/transportRoutes/${route.id}`)),
        transaction.get(
          db.collection(`orgs/${orgId}/studentTransportEnrollments`).where("routeId", "==", route.id),
        ),
      ]);
      const currentRoute = parseRoute(routeSnapshot.id, routeSnapshot.data() ?? {});
      const assignment = authorizeRoute(
        actor,
        currentRoute,
        existingSnapshot.exists ? "UPDATE_DRAFT" : "CREATE",
      );
      const existing = existingSnapshot.exists
        ? parseBatch(existingSnapshot.id, existingSnapshot.data() ?? {})
        : undefined;
      if (
        existing &&
        (existing.orgId !== orgId ||
          existing.routeId !== currentRoute.id ||
          existing.tripKind !== incoming.tripKind ||
          existing.serviceDate !== serviceDate)
      ) {
        throw new HttpsError("data-loss", "Stored transport batch identity is invalid.");
      }
      if (existing && !EDITABLE_BATCH_STATUSES.has(existing.status)) {
        throw new HttpsError("failed-precondition", "Submitted transport trips are read-only.");
      }
      if (existing && expectedUpdatedAt !== existing.updatedAt) {
        throw new HttpsError("aborted", "This draft was changed elsewhere. Reload before saving.");
      }
      if (!existing && expectedUpdatedAt !== undefined) {
        throw new HttpsError("aborted", "This draft no longer matches the stored version.");
      }
      const enrollments = activeEnrollments({
        route: currentRoute,
        enrollments: parseEnrollments(enrollmentsSnapshot),
        serviceDate,
      });
      const rows = buildAuthoritativeRows({
        incoming,
        existing,
        enrollments,
        actorPersonId: actor.personId,
        now: Date.now(),
      });
      const summary = calculateTransportBatchSummary(rows);
      const now = Date.now();
      const schoolId = currentRoute.schoolId || enrollments[0]?.schoolId;
      const academicYearId =
        currentRoute.academicYearId || enrollments[0]?.academicYearId;
      if (!schoolId || !academicYearId) {
        throw new HttpsError("failed-precondition", "Route academic context is incomplete.");
      }
      const saved: TransportAttendanceBatch = {
        id: expectedBatchId,
        orgId,
        schoolId,
        academicYearId,
        termId: existing?.termId ?? term?.termId,
        termTitle: existing?.termTitle ?? term?.termTitle,
        termShortTitle: existing?.termShortTitle ?? term?.termShortTitle,
        routeId: currentRoute.id,
        routeTitle: currentRoute.title,
        vehicleId: currentRoute.vehicleId,
        driverPersonId: currentRoute.driverPersonId,
        supervisorPersonId: actor.personId,
        tripKind: incoming.tripKind,
        serviceDate,
        status: resolveTransportBatchStatus(rows, existing?.status ?? "DRAFT"),
        createdByPersonId: existing?.createdByPersonId ?? actor.personId,
        createdByRoleKey: existing?.createdByRoleKey ?? actor.roleKey,
        operationalAssignmentId:
          existing?.operationalAssignmentId ?? assignment?.id,
        targetStudentIds: rows.map((row) => row.studentId),
        targetCount: summary.targetCount,
        completedCount: summary.completedCount,
        missingCount: summary.missingCount,
        issueCount: summary.issueCount,
        studentRows: rows,
        note: text(incoming.note).slice(0, 2000) || undefined,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      transaction.set(batchRef, cleanForFirestore(saved));
      return saved;
    });
  },
);

export const submitTransportAttendance = onCall(
  { region: REGION, cors: WEB_STAFF_CORS_ORIGINS, memory: "512MiB" },
  async (request): Promise<TransportAttendanceBatch> => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Authentication is required.");
    const input = record(request.data);
    const orgId = requireId(input.orgId, "orgId");
    const batchId = requireId(input.batchId, "batchId");
    const expectedUpdatedAt =
      typeof input.expectedUpdatedAt === "number" ? input.expectedUpdatedAt : undefined;
    const actor = await resolveActor(uid, orgId);
    const db = getFirestore();
    const batchRef = db.doc(`orgs/${orgId}/transportAttendanceBatches/${batchId}`);
    const initialSnapshot = await batchRef.get();
    if (!initialSnapshot.exists) throw new HttpsError("not-found", "Save the trip draft before submitting it.");
    const initialBatch = parseBatch(initialSnapshot.id, initialSnapshot.data() ?? {});
    await getRouteAndAuthorize({ actor, routeId: initialBatch.routeId, permission: "SUBMIT" });

    return db.runTransaction(async (transaction) => {
      const batchSnapshot = await transaction.get(batchRef);
      if (!batchSnapshot.exists) throw new HttpsError("not-found", "Transport batch was not found.");
      const batch = parseBatch(batchSnapshot.id, batchSnapshot.data() ?? {});
      if (
        batch.orgId !== orgId ||
        batch.id !==
          canonicalBatchId({
            routeId: batch.routeId,
            serviceDate: batch.serviceDate,
            tripKind: batch.tripKind,
          })
      ) {
        throw new HttpsError("data-loss", "Stored transport batch identity is invalid.");
      }
      if (["SUBMITTED", "REVIEWED", "LOCKED"].includes(batch.status)) return batch;
      if (!EDITABLE_BATCH_STATUSES.has(batch.status)) {
        throw new HttpsError("failed-precondition", "This transport trip cannot be submitted.");
      }
      if (expectedUpdatedAt !== batch.updatedAt) {
        throw new HttpsError("aborted", "This draft was changed elsewhere. Reload before submitting.");
      }
      const routeRef = db.doc(`orgs/${orgId}/transportRoutes/${batch.routeId}`);
      const [routeSnapshot, enrollmentsSnapshot] = await Promise.all([
        transaction.get(routeRef),
        transaction.get(
          db.collection(`orgs/${orgId}/studentTransportEnrollments`).where("routeId", "==", batch.routeId),
        ),
      ]);
      const route = parseRoute(routeSnapshot.id, routeSnapshot.data() ?? {});
      authorizeRoute(actor, route, "SUBMIT");
      const enrollments = activeEnrollments({
        route,
        enrollments: parseEnrollments(enrollmentsSnapshot),
        serviceDate: batch.serviceDate,
      });
      if (!setsEqual(batch.targetStudentIds, enrollments.map((item) => item.studentId))) {
        throw new HttpsError(
          "failed-precondition",
          "The active transport enrollment list changed. Reload and save the draft before submitting.",
        );
      }
      if (batch.studentRows.length > MAX_ATOMIC_SUBMISSION_ROWS) {
        throw new HttpsError(
          "resource-exhausted",
          `A transport batch cannot exceed ${MAX_ATOMIC_SUBMISSION_ROWS} rows for atomic submission.`,
        );
      }

      let submitted: TransportAttendanceBatch;
      try {
        const submittedDraft = submitTransportAttendanceBatch(batch, Date.now());
        submitted = {
          ...submittedDraft,
          studentRows: submittedDraft.studentRows.map((row) => ({
            ...row,
            recordId: row.recordId ?? `${submittedDraft.id}_${row.studentId}`,
          })),
        };
      } catch (error) {
        throw new HttpsError(
          "failed-precondition",
          error instanceof Error ? error.message : "Transport trip is incomplete.",
        );
      }
      const records = buildTransportAttendanceRecordsFromBatch({
        batch: submitted,
        recordedByPersonId: actor.personId,
        recordedByRoleKey: actor.roleKey,
        now: submitted.submittedAt,
      });
      const recordRefs = records.map((item) =>
        db.doc(`orgs/${orgId}/studentTransportAttendanceRecords/${item.id}`),
      );
      const existingRecords = await Promise.all(
        recordRefs.map((recordRef) => transaction.get(recordRef)),
      );
      existingRecords.forEach((snapshot, index) => {
        if (!snapshot.exists) return;
        const data = record(snapshot.data());
        if (text(data.batchId) !== batch.id || text(data.studentId) !== records[index].studentId) {
          throw new HttpsError("already-exists", "A conflicting transport attendance record exists.");
        }
      });
      records.forEach((item, index) => {
        if (!existingRecords[index].exists) {
          transaction.set(recordRefs[index], cleanForFirestore(item));
        }
      });
      transaction.set(batchRef, cleanForFirestore(submitted));
      return submitted;
    });
  },
);
