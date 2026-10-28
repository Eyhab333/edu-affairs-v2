import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import {
  StudentTransportEnrollmentSchema,
  TransportRouteSchema,
  TransportRouteStopSchema,
  TransportVehicleSchema,
  type StudentTransportEnrollment,
  type TransportRoute,
  type TransportRouteStop,
  type TransportVehicle,
} from "@takween/contracts";

import {
  canManageOrg,
  getActiveMembership,
  isActiveMembership,
  membershipRoleKey,
  membershipSchoolIds,
  readRequiredString,
  readString,
  type FirestoreRecord,
} from "../staff-chat/shared";

const REGION = "me-central2";
const ACTIVE_ENROLLMENT_STATUSES = new Set(["ACTIVE", "PAUSED"]);
const ROUTE_STATUSES = new Set(["ACTIVE", "INACTIVE", "ARCHIVED"]);
const VEHICLE_STATUSES = new Set(["ACTIVE", "MAINTENANCE", "INACTIVE", "ARCHIVED"]);
const STOP_KINDS = new Set(["PICKUP", "DROPOFF", "BOTH"]);

type TransportAdminAction =
  | "UPSERT_VEHICLE"
  | "UPSERT_ROUTE"
  | "SET_ROUTE_SUPERVISORS"
  | "UPSERT_STOP"
  | "ARCHIVE_STOP"
  | "CREATE_ENROLLMENT"
  | "CREATE_ENROLLMENTS_BULK"
  | "CHANGE_ENROLLMENT_STATUS"
  | "TRANSFER_ENROLLMENT";

type TransportStaffCandidate = {
  personId: string;
  roleKey: string;
  positionTitle: string;
  schoolIds: string[];
};

function data(value: unknown): FirestoreRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as FirestoreRecord)
    : {};
}

function strings(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && !!item.trim())
    : [];
}

function numberValue(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function optionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function id(value: unknown, fieldName: string) {
  const result = readString(value);
  if (!result || result.includes("/")) {
    throw new HttpsError("invalid-argument", `${fieldName} is required.`);
  }
  return result;
}

function optionalId(value: unknown, fieldName: string) {
  const result = readString(value);
  if (result.includes("/")) {
    throw new HttpsError("invalid-argument", `${fieldName} is invalid.`);
  }
  return result;
}

function clean<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function label(record: FirestoreRecord, fallback: string) {
  return (
    readString(record.displayName) ||
    readString(record.nameAr) ||
    readString(record.title) ||
    readString(record.name) ||
    readString(record.shortName) ||
    readString(record.nameEn) ||
    fallback
  );
}

async function assertAdmin(uid: string, orgId: string) {
  const membership = await getActiveMembership({ db: getFirestore(), orgId, uid });
  if (!canManageOrg(membership)) {
    throw new HttpsError(
      "permission-denied",
      "Organization administrator access is required.",
    );
  }
}

function normalizeVehicle(idValue: string, orgId: string, value: FirestoreRecord) {
  const normalized = {
    id: idValue,
    orgId,
    code: readString(value.code) || undefined,
    plateNumber: readString(value.plateNumber) || undefined,
    title: readString(value.title) || readString(value.name) || idValue,
    model: readString(value.model) || undefined,
    capacity: optionalNumber(value.capacity),
    driverPersonId: readString(value.driverPersonId) || undefined,
    status: VEHICLE_STATUSES.has(readString(value.status))
      ? readString(value.status)
      : value.isActive === false
        ? "INACTIVE"
        : "ACTIVE",
    notes: readString(value.notes) || undefined,
    createdAt: numberValue(value.createdAt),
    updatedAt: numberValue(value.updatedAt),
  };
  const parsed = TransportVehicleSchema.safeParse(normalized);
  return parsed.success ? parsed.data : undefined;
}

function normalizeRoute(idValue: string, orgId: string, value: FirestoreRecord) {
  const status = ROUTE_STATUSES.has(readString(value.status))
    ? readString(value.status)
    : value.isArchived === true
      ? "ARCHIVED"
      : value.isActive === false
        ? "INACTIVE"
        : "ACTIVE";
  const normalized = {
    id: idValue,
    orgId,
    schoolId: readString(value.schoolId) || undefined,
    academicYearId: readString(value.academicYearId) || undefined,
    code: readString(value.code) || undefined,
    title: readString(value.title) || readString(value.name) || idValue,
    shortTitle: readString(value.shortTitle) || undefined,
    description: readString(value.description) || undefined,
    vehicleId: readString(value.vehicleId) || undefined,
    driverPersonId: readString(value.driverPersonId) || undefined,
    supervisorPersonIds: strings(value.supervisorPersonIds),
    areaLabel: readString(value.areaLabel) || undefined,
    startsFromLabel: readString(value.startsFromLabel) || undefined,
    endsAtLabel: readString(value.endsAtLabel) || undefined,
    status,
    order: optionalNumber(value.order),
    isArchived: value.isArchived === true || status === "ARCHIVED",
    createdAt: numberValue(value.createdAt),
    updatedAt: numberValue(value.updatedAt),
  };
  const parsed = TransportRouteSchema.safeParse(normalized);
  return parsed.success ? parsed.data : undefined;
}

function normalizeStop(idValue: string, orgId: string, value: FirestoreRecord) {
  const normalized = {
    id: idValue,
    orgId,
    routeId: readString(value.routeId),
    title: readString(value.title) || idValue,
    description: readString(value.description) || undefined,
    kind: STOP_KINDS.has(readString(value.kind)) ? readString(value.kind) : "BOTH",
    areaLabel: readString(value.areaLabel) || undefined,
    addressText: readString(value.addressText) || undefined,
    latitude: optionalNumber(value.latitude),
    longitude: optionalNumber(value.longitude),
    order: optionalNumber(value.order),
    estimatedMorningTime: readString(value.estimatedMorningTime) || undefined,
    estimatedAfternoonTime: readString(value.estimatedAfternoonTime) || undefined,
    isActive: value.isActive !== false,
    isArchived: value.isArchived === true,
    createdAt: numberValue(value.createdAt),
    updatedAt: numberValue(value.updatedAt),
  };
  const parsed = TransportRouteStopSchema.safeParse(normalized);
  return parsed.success ? parsed.data : undefined;
}

function normalizeEnrollment(
  idValue: string,
  orgId: string,
  value: FirestoreRecord,
): StudentTransportEnrollment | undefined {
  const normalized = {
    id: idValue,
    orgId,
    schoolId: readString(value.schoolId),
    academicYearId: readString(value.academicYearId),
    termId: readString(value.termId) || undefined,
    termTitle: readString(value.termTitle) || undefined,
    termShortTitle: readString(value.termShortTitle) || undefined,
    studentId: readString(value.studentId),
    studentPersonId: readString(value.studentPersonId) || undefined,
    studentDisplayName: readString(value.studentDisplayName) || undefined,
    guardianPersonId: readString(value.guardianPersonId) || undefined,
    guardianDisplayName: readString(value.guardianDisplayName) || undefined,
    guardianPhone: readString(value.guardianPhone) || undefined,
    routeId: readString(value.routeId),
    routeTitle: readString(value.routeTitle) || undefined,
    pickupStopId: readString(value.pickupStopId) || undefined,
    pickupStopTitle: readString(value.pickupStopTitle) || undefined,
    dropoffStopId: readString(value.dropoffStopId) || undefined,
    dropoffStopTitle: readString(value.dropoffStopTitle) || undefined,
    status: readString(value.status) || "ACTIVE",
    startsAt: optionalNumber(value.startsAt) ?? optionalNumber(value.startAt),
    endsAt: optionalNumber(value.endsAt) ?? optionalNumber(value.endAt),
    notes: readString(value.notes) || readString(value.note) || undefined,
    createdAt: numberValue(value.createdAt),
    updatedAt: numberValue(value.updatedAt),
  };
  const parsed = StudentTransportEnrollmentSchema.safeParse(normalized);
  return parsed.success ? parsed.data : undefined;
}

function isEligibleEmployeeMembership(membership: FirestoreRecord) {
  return (
    isActiveMembership(membership) &&
    !!readString(membership.personId) &&
    membershipRoleKey(membership) !== "GUARDIAN"
  );
}

function candidateFromMembership(membership: FirestoreRecord): TransportStaffCandidate {
  const roleKey = membershipRoleKey(membership);
  return {
    personId: readString(membership.personId),
    roleKey,
    positionTitle:
      readString(membership.title) || readString(membership.positionCode) || roleKey,
    schoolIds: membershipSchoolIds(membership),
  };
}

function mergeStaffCandidates(candidates: TransportStaffCandidate[]) {
  const merged = new Map<string, TransportStaffCandidate>();
  candidates.forEach((candidate) => {
    const current = merged.get(candidate.personId);
    if (!current) {
      merged.set(candidate.personId, candidate);
      return;
    }
    merged.set(candidate.personId, {
      ...current,
      schoolIds: Array.from(new Set([...current.schoolIds, ...candidate.schoolIds])),
      positionTitle: current.positionTitle || candidate.positionTitle,
      roleKey: current.roleKey || candidate.roleKey,
    });
  });
  return Array.from(merged.values());
}

async function hydrateStaffCandidates(
  orgId: string,
  candidates: TransportStaffCandidate[],
) {
  const db = getFirestore();
  const people = candidates.length
    ? await db.getAll(
        ...candidates.map((candidate) =>
          db.doc(`orgs/${orgId}/people/${candidate.personId}`),
        ),
      )
    : [];
  const peopleById = new Map(
    people
      .filter((person) => person.exists)
      .map((person) => [person.id, data(person.data())]),
  );
  return candidates.map((candidate) => ({
    ...candidate,
    displayName: label(peopleById.get(candidate.personId) ?? {}, candidate.personId),
  }));
}

async function loadStaffCandidates(orgId: string, personIds: string[]) {
  const ids = Array.from(new Set(personIds.filter(Boolean)));
  if (!ids.length) return [];
  const db = getFirestore();
  const snapshots = await Promise.all(
    Array.from({ length: Math.ceil(ids.length / 30) }, (_, index) =>
      db.collectionGroup("orgMemberships")
        .where("personId", "in", ids.slice(index * 30, (index + 1) * 30))
        .get(),
    ),
  );
  const candidates = mergeStaffCandidates(
    snapshots.flatMap((snapshot) => snapshot.docs).flatMap((document) => {
      const membership = data(document.data());
      return readString(membership.orgId) === orgId && isEligibleEmployeeMembership(membership)
        ? [candidateFromMembership(membership)]
        : [];
    }),
  );
  return (await hydrateStaffCandidates(orgId, candidates))
    .sort((left, right) => left.displayName.localeCompare(right.displayName, "ar"));
}

export const getTransportAdminWorkspace = onCall(
  { region: REGION, memory: "1GiB" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Authentication is required.");
    const orgId = id(data(request.data).orgId, "orgId");
    await assertAdmin(uid, orgId);
    const db = getFirestore();
    const [schoolsSnapshot, orgYearsSnapshot, vehiclesSnapshot, routesSnapshot, stopsSnapshot, enrollmentsSnapshot, assignmentsSnapshot] =
      await Promise.all([
        db.collection(`orgs/${orgId}/schools`).get(),
        db.collection(`orgs/${orgId}/academicYears`).get(),
        db.collection(`orgs/${orgId}/transportVehicles`).get(),
        db.collection(`orgs/${orgId}/transportRoutes`).get(),
        db.collection(`orgs/${orgId}/transportRouteStops`).get(),
        db.collection(`orgs/${orgId}/studentTransportEnrollments`).get(),
        db.collection(`orgs/${orgId}/operationalAssignments`)
          .where("operationKind", "==", "TRANSPORT_ATTENDANCE")
          .get(),
      ]);
    const referencedSupervisorIds = Array.from(new Set([
      ...routesSnapshot.docs.flatMap((document) => strings(document.data().supervisorPersonIds)),
      ...assignmentsSnapshot.docs
        .filter((document) => readString(document.data().status) === "ACTIVE" && document.data().isActive !== false)
        .map((document) => readString(document.data().actorPersonId)),
    ].filter(Boolean)));
    const staff = await loadStaffCandidates(orgId, referencedSupervisorIds);
    const nestedYearSnapshots = await Promise.all(
      schoolsSnapshot.docs.map((school) => school.ref.collection("academicYears").get()),
    );
    const academicYears = new Map<string, { id: string; schoolId?: string; title: string }>();
    orgYearsSnapshot.docs.forEach((document) => {
      academicYears.set(document.id, {
        id: document.id,
        title: label(data(document.data()), document.id),
      });
    });
    nestedYearSnapshots.forEach((snapshot, index) => {
      snapshot.docs.forEach((document) => {
        academicYears.set(`${schoolsSnapshot.docs[index].id}:${document.id}`, {
          id: document.id,
          schoolId: schoolsSnapshot.docs[index].id,
          title: label(data(document.data()), document.id),
        });
      });
    });
    return {
      schools: schoolsSnapshot.docs.map((document) => ({
        id: document.id,
        title: label(data(document.data()), document.id),
      })),
      academicYears: Array.from(academicYears.values()),
      vehicles: vehiclesSnapshot.docs.flatMap((document) => {
        const item = normalizeVehicle(document.id, orgId, data(document.data()));
        return item ? [item] : [];
      }),
      routes: routesSnapshot.docs.flatMap((document) => {
        const item = normalizeRoute(document.id, orgId, data(document.data()));
        return item ? [item] : [];
      }),
      stops: stopsSnapshot.docs.flatMap((document) => {
        const item = normalizeStop(document.id, orgId, data(document.data()));
        return item ? [item] : [];
      }),
      enrollments: enrollmentsSnapshot.docs.flatMap((document) => {
        const item = normalizeEnrollment(document.id, orgId, data(document.data()));
        return item ? [item] : [];
      }),
      assignments: assignmentsSnapshot.docs.map((document) => ({
        id: document.id,
        actorPersonId: readString(document.data().actorPersonId),
        scopeId: readString(document.data().scopeId),
        status: readString(document.data().status),
        isActive: document.data().isActive !== false,
        permissions: strings(document.data().permissions),
      })),
      staff,
    };
  },
);

export const searchTransportAdminStudents = onCall(
  { region: REGION, memory: "1GiB" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Authentication is required.");
    const input = data(request.data);
    const orgId = id(input.orgId, "orgId");
    const schoolId = id(input.schoolId, "schoolId");
    const classId = optionalId(input.classId, "classId");
    const queryText = readString(input.query).toLocaleLowerCase("ar");
    await assertAdmin(uid, orgId);
    const db = getFirestore();
    const enrollmentSnapshot = await db
      .collection(`orgs/${orgId}/studentEnrollments`)
      .where("schoolId", "==", schoolId)
      .where("status", "==", "ACTIVE")
      .get();
    const activeEnrollments = enrollmentSnapshot.docs
      .map((document): FirestoreRecord => ({
        ...data(document.data()),
        id: document.id,
      }))
      .filter(
        (item) =>
          !optionalNumber(item.startAt) || numberValue(item.startAt) <= Date.now(),
      )
      .filter(
        (item) => !optionalNumber(item.endAt) || numberValue(item.endAt) >= Date.now(),
      )
      .filter((item) => !classId || readString(item.classId) === classId);
    const studentIds = Array.from(
      new Set(activeEnrollments.map((item) => readString(item.studentId)).filter(Boolean)),
    );
    const students = studentIds.length
      ? await db.getAll(
          ...studentIds.map((studentId) => db.doc(`orgs/${orgId}/students/${studentId}`)),
        )
      : [];
    const personIds = students
      .filter((student) => student.exists)
      .map((student) => readString(student.data()?.personId))
      .filter(Boolean);
    const people = personIds.length
      ? await db.getAll(
          ...personIds.map((personId) => db.doc(`orgs/${orgId}/people/${personId}`)),
        )
      : [];
    const personById = new Map(
      people.filter((person) => person.exists).map((person) => [person.id, data(person.data())]),
    );
    const enrollmentByStudent = new Map(
      activeEnrollments.map((enrollment) => [readString(enrollment.studentId), enrollment]),
    );
    const transportSnapshot = studentIds.length
      ? await db.collection(`orgs/${orgId}/studentTransportEnrollments`)
          .where("schoolId", "==", schoolId)
          .get()
      : undefined;
    const transportByStudent = new Map<string, StudentTransportEnrollment>();
    transportSnapshot?.docs.forEach((document) => {
      const item = normalizeEnrollment(document.id, orgId, data(document.data()));
      if (
        item &&
        ACTIVE_ENROLLMENT_STATUSES.has(item.status) &&
        (item.endsAt === undefined || item.endsAt >= Date.now())
      ) {
        transportByStudent.set(item.studentId, item);
      }
    });
    return students
      .flatMap((student) => {
        if (!student.exists) return [];
        const studentData = data(student.data());
        const personId = readString(studentData.personId);
        const displayName = label(personById.get(personId) ?? {}, student.id);
        if (
          queryText &&
          !displayName.toLocaleLowerCase("ar").includes(queryText) &&
          !student.id.toLocaleLowerCase().includes(queryText)
        ) {
          return [];
        }
        const academic = enrollmentByStudent.get(student.id);
        return [{
          studentId: student.id,
          studentPersonId: personId,
          displayName,
          schoolId,
          academicYearId: readString(academic?.academicYearId),
          classId: readString(academic?.classId),
          classTitle:
            readString(academic?.classTitle) ||
            readString(studentData.classTitle) ||
            readString(academic?.classId),
          academicEnrollmentId: readString(academic?.id),
          transportEnrollment: transportByStudent.get(student.id),
        }];
      })
      .sort((left, right) => left.displayName.localeCompare(right.displayName, "ar"))
      .slice(0, 100);
  },
);

export const searchTransportAdminEmployees = onCall(
  { region: REGION, memory: "1GiB" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Authentication is required.");
    const input = data(request.data);
    const orgId = id(input.orgId, "orgId");
    const schoolId = optionalId(input.schoolId, "schoolId");
    const queryText = readString(input.query).toLocaleLowerCase("ar");
    const positionText = readString(input.position).toLocaleLowerCase("ar");
    const assignmentStatus = readString(input.assignmentStatus) || "ALL";
    if (!["ALL", "ASSIGNED", "UNASSIGNED"].includes(assignmentStatus)) {
      throw new HttpsError("invalid-argument", "Employee assignment status is invalid.");
    }
    const routeId = optionalId(input.routeId, "routeId");
    const cursor = readString(input.cursor);
    if (cursor && !/^users\/[^/]+\/orgMemberships\/[^/]+$/.test(cursor)) {
      throw new HttpsError("invalid-argument", "Employee cursor is invalid.");
    }
    await assertAdmin(uid, orgId);
    const db = getFirestore();
    const pageSize = 100;
    let membershipQuery = db.collectionGroup("orgMemberships")
      .where("orgId", "==", orgId)
      .orderBy("personId")
      .limit(pageSize);
    if (cursor) {
      const cursorSnapshot = await db.doc(cursor).get();
      if (
        !cursorSnapshot.exists ||
        readString(cursorSnapshot.data()?.orgId) !== orgId
      ) {
        throw new HttpsError("invalid-argument", "Employee cursor no longer exists.");
      }
      membershipQuery = membershipQuery.startAfter(cursorSnapshot);
    }
    const membershipSnapshot = await membershipQuery.get();
    const candidates = mergeStaffCandidates(
      membershipSnapshot.docs.flatMap((document) => {
        const membership = data(document.data());
        return isEligibleEmployeeMembership(membership)
          ? [candidateFromMembership(membership)]
          : [];
      }),
    );
    const [staff, assignmentsSnapshot] = await Promise.all([
      hydrateStaffCandidates(orgId, candidates),
      db.collection(`orgs/${orgId}/operationalAssignments`)
        .where("operationKind", "==", "TRANSPORT_ATTENDANCE")
        .get(),
    ]);
    const activeRoutesByPerson = new Map<string, string[]>();
    assignmentsSnapshot.docs.forEach((document) => {
      const assignment = data(document.data());
      if (readString(assignment.status) !== "ACTIVE" || assignment.isActive === false) return;
      const personId = readString(assignment.actorPersonId);
      if (!personId) return;
      const routeIds = Array.from(new Set([
        readString(assignment.scopeType) === "ROUTE" ? readString(assignment.scopeId) : "",
        ...strings(assignment.targetRouteIds),
      ].filter(Boolean)));
      if (routeIds.length) {
        activeRoutesByPerson.set(personId, Array.from(new Set([
          ...(activeRoutesByPerson.get(personId) ?? []),
          ...routeIds,
        ])));
      }
    });
    const employees = staff
      .filter((employee) =>
        !schoolId || employee.schoolIds.length === 0 || employee.schoolIds.includes(schoolId),
      )
      .filter((employee) =>
        !queryText ||
        employee.displayName.toLocaleLowerCase("ar").includes(queryText) ||
        employee.personId.toLocaleLowerCase().includes(queryText),
      )
      .filter((employee) =>
        !positionText ||
        employee.positionTitle.toLocaleLowerCase("ar").includes(positionText) ||
        employee.roleKey.toLocaleLowerCase().includes(positionText),
      )
      .map((employee) => {
        const assignedRouteIds = activeRoutesByPerson.get(employee.personId) ?? [];
        return {
          ...employee,
          assignedRouteIds,
          isAssignedToRoute: !!routeId && assignedRouteIds.includes(routeId),
        };
      })
      .filter((employee) =>
        assignmentStatus === "ALL" ||
        (assignmentStatus === "ASSIGNED" && employee.assignedRouteIds.length > 0) ||
        (assignmentStatus === "UNASSIGNED" && employee.assignedRouteIds.length === 0),
      )
      .sort((left, right) => left.displayName.localeCompare(right.displayName, "ar"));
    return {
      employees,
      nextCursor: membershipSnapshot.size === pageSize
        ? membershipSnapshot.docs[membershipSnapshot.docs.length - 1]?.ref.path
        : undefined,
    };
  },
);

function rangesOverlap(
  leftStart: number,
  leftEnd: number | undefined,
  rightStart: number,
  rightEnd: number | undefined,
) {
  return leftStart <= (rightEnd ?? Number.MAX_SAFE_INTEGER) &&
    rightStart <= (leftEnd ?? Number.MAX_SAFE_INTEGER);
}

async function validateStops(params: {
  transaction: FirebaseFirestore.Transaction;
  orgId: string;
  routeId: string;
  pickupStopId: string;
  dropoffStopId: string;
}) {
  const ids = Array.from(new Set([params.pickupStopId, params.dropoffStopId].filter(Boolean)));
  const snapshots = await Promise.all(
    ids.map((stopId) =>
      params.transaction.get(
        getFirestore().doc(`orgs/${params.orgId}/transportRouteStops/${stopId}`),
      ),
    ),
  );
  const stops = new Map<string, TransportRouteStop>();
  snapshots.forEach((snapshot) => {
    if (!snapshot.exists) {
      throw new HttpsError("failed-precondition", "A selected transport stop does not exist.");
    }
    const stop = normalizeStop(snapshot.id, params.orgId, data(snapshot.data()));
    if (!stop || stop.routeId !== params.routeId || stop.isArchived || stop.isActive === false) {
      throw new HttpsError("failed-precondition", "A selected transport stop is not active on this route.");
    }
    stops.set(stop.id, stop);
  });
  return stops;
}

async function validateStudentPlacement(params: {
  transaction: FirebaseFirestore.Transaction;
  orgId: string;
  studentId: string;
  route: TransportRoute;
}) {
  const db = getFirestore();
  const [studentSnapshot, placementsSnapshot] = await Promise.all([
    params.transaction.get(db.doc(`orgs/${params.orgId}/students/${params.studentId}`)),
    params.transaction.get(
      db.collection(`orgs/${params.orgId}/studentEnrollments`).where("studentId", "==", params.studentId),
    ),
  ]);
  if (!studentSnapshot.exists || studentSnapshot.data()?.isArchived === true) {
    throw new HttpsError("not-found", "Student was not found.");
  }
  const placement = placementsSnapshot.docs.find((document) => {
    const item = data(document.data());
    return (
      readString(item.status) === "ACTIVE" &&
      readString(item.schoolId) === params.route.schoolId &&
      (!params.route.academicYearId ||
        readString(item.academicYearId) === params.route.academicYearId)
    );
  });
  if (!placement) {
    throw new HttpsError(
      "failed-precondition",
      "Student has no active academic enrollment matching the route context.",
    );
  }
  const studentData = data(studentSnapshot.data());
  const personId = readString(studentData.personId);
  const personSnapshot = personId
    ? await params.transaction.get(db.doc(`orgs/${params.orgId}/people/${personId}`))
    : undefined;
  return {
    placementId: placement.id,
    personId,
    displayName: label(data(personSnapshot?.data()), params.studentId),
    academicYearId: readString(placement.data().academicYearId),
  };
}

async function createTransportEnrollment(params: {
  orgId: string;
  routeId: string;
  studentId: string;
  pickupStopId: string;
  dropoffStopId: string;
  startsAt: number;
  endsAt?: number;
  notes?: string;
  now: number;
}) {
  const db = getFirestore();
  const enrollmentRef = db.collection(`orgs/${params.orgId}/studentTransportEnrollments`).doc();
  return db.runTransaction(async (transaction) => {
    const [routeSnapshot, existingSnapshot] = await Promise.all([
      transaction.get(db.doc(`orgs/${params.orgId}/transportRoutes/${params.routeId}`)),
      transaction.get(
        db.collection(`orgs/${params.orgId}/studentTransportEnrollments`)
          .where("studentId", "==", params.studentId),
      ),
    ]);
    if (!routeSnapshot.exists) throw new HttpsError("not-found", "Transport route was not found.");
    const route = normalizeRoute(routeSnapshot.id, params.orgId, data(routeSnapshot.data()));
    if (!route || route.status !== "ACTIVE") {
      throw new HttpsError("failed-precondition", "Student enrollment requires an active route.");
    }
    const overlapping = existingSnapshot.docs.some((document) => {
      const item = normalizeEnrollment(document.id, params.orgId, data(document.data()));
      return item && ACTIVE_ENROLLMENT_STATUSES.has(item.status) &&
        rangesOverlap(
          params.startsAt,
          params.endsAt,
          item.startsAt ?? item.createdAt,
          item.endsAt,
        );
    });
    if (overlapping) {
      throw new HttpsError("already-exists", "Student already has an overlapping transport enrollment.");
    }
    const placement = await validateStudentPlacement({
      transaction,
      orgId: params.orgId,
      studentId: params.studentId,
      route,
    });
    const stops = await validateStops({
      transaction,
      orgId: params.orgId,
      routeId: params.routeId,
      pickupStopId: params.pickupStopId,
      dropoffStopId: params.dropoffStopId,
    });
    const enrollment = StudentTransportEnrollmentSchema.parse({
      id: enrollmentRef.id,
      orgId: params.orgId,
      schoolId: route.schoolId,
      academicYearId: route.academicYearId || placement.academicYearId,
      studentId: params.studentId,
      studentPersonId: placement.personId || undefined,
      studentDisplayName: placement.displayName,
      routeId: params.routeId,
      routeTitle: route.title,
      pickupStopId: params.pickupStopId || undefined,
      pickupStopTitle: stops.get(params.pickupStopId)?.title,
      dropoffStopId: params.dropoffStopId || undefined,
      dropoffStopTitle: stops.get(params.dropoffStopId)?.title,
      status: "ACTIVE",
      startsAt: params.startsAt,
      endsAt: params.endsAt,
      notes: params.notes || undefined,
      createdAt: params.now,
      updatedAt: params.now,
    });
    transaction.create(enrollmentRef, clean(enrollment));
    return { id: enrollmentRef.id };
  });
}

function enrollmentFailure(error: unknown) {
  if (error instanceof HttpsError) {
    return { code: error.code, message: error.message };
  }
  return { code: "internal", message: "Unable to create transport enrollment." };
}

export const manageTransportAdministration = onCall(
  { region: REGION, memory: "1GiB" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Authentication is required.");
    const input = data(request.data);
    const orgId = id(input.orgId, "orgId");
    const action = readString(input.action) as TransportAdminAction;
    const payload = data(input.payload);
    await assertAdmin(uid, orgId);
    const db = getFirestore();
    const now = Date.now();

    if (action === "UPSERT_VEHICLE") {
      const vehicleId = optionalId(payload.id, "vehicleId") || db.collection(`orgs/${orgId}/transportVehicles`).doc().id;
      const ref = db.doc(`orgs/${orgId}/transportVehicles/${vehicleId}`);
      return db.runTransaction(async (transaction) => {
        const [existingSnapshot, routesSnapshot] = await Promise.all([
          transaction.get(ref),
          transaction.get(db.collection(`orgs/${orgId}/transportRoutes`).where("vehicleId", "==", vehicleId)),
        ]);
        const existing = existingSnapshot.exists
          ? normalizeVehicle(existingSnapshot.id, orgId, data(existingSnapshot.data()))
          : undefined;
        const status = readString(payload.status) || existing?.status || "ACTIVE";
        if (!VEHICLE_STATUSES.has(status)) {
          throw new HttpsError("invalid-argument", "Vehicle status is invalid.");
        }
        if (
          status === "ARCHIVED" &&
          routesSnapshot.docs.some((document) => {
            const route = normalizeRoute(document.id, orgId, data(document.data()));
            return route && route.status !== "ARCHIVED" && route.isArchived !== true;
          })
        ) {
          throw new HttpsError("failed-precondition", "Remove this vehicle from active routes before archiving it.");
        }
        const capacity = optionalNumber(payload.capacity);
        if (capacity !== undefined && (!Number.isInteger(capacity) || capacity < 0)) {
          throw new HttpsError("invalid-argument", "Vehicle capacity must be a non-negative integer.");
        }
        const vehicle = TransportVehicleSchema.parse({
          id: vehicleId,
          orgId,
          code: readString(payload.code) || undefined,
          plateNumber: readString(payload.plateNumber) || undefined,
          title: readRequiredString(payload.title, "title"),
          model: readString(payload.model) || undefined,
          capacity,
          driverPersonId: readString(payload.driverPersonId) || undefined,
          status,
          notes: readString(payload.notes) || undefined,
          createdAt: existing?.createdAt || now,
          updatedAt: now,
        });
        transaction.set(ref, clean(vehicle));
        return { id: vehicleId };
      });
    }

    if (action === "UPSERT_ROUTE") {
      const routeId = optionalId(payload.id, "routeId") || db.collection(`orgs/${orgId}/transportRoutes`).doc().id;
      const schoolId = id(payload.schoolId, "schoolId");
      const academicYearId = id(payload.academicYearId, "academicYearId");
      const vehicleId = optionalId(payload.vehicleId, "vehicleId");
      const ref = db.doc(`orgs/${orgId}/transportRoutes/${routeId}`);
      return db.runTransaction(async (transaction) => {
        const [
          existingSnapshot,
          schoolSnapshot,
          orgYearSnapshot,
          schoolYearSnapshot,
          enrollmentSnapshot,
          vehicleSnapshot,
        ] = await Promise.all([
          transaction.get(ref),
          transaction.get(db.doc(`orgs/${orgId}/schools/${schoolId}`)),
          transaction.get(db.doc(`orgs/${orgId}/academicYears/${academicYearId}`)),
          transaction.get(db.doc(`orgs/${orgId}/schools/${schoolId}/academicYears/${academicYearId}`)),
          transaction.get(db.collection(`orgs/${orgId}/studentTransportEnrollments`).where("routeId", "==", routeId)),
          vehicleId
            ? transaction.get(db.doc(`orgs/${orgId}/transportVehicles/${vehicleId}`))
            : Promise.resolve(undefined),
        ]);
        const existing = existingSnapshot.exists
          ? normalizeRoute(existingSnapshot.id, orgId, data(existingSnapshot.data()))
          : undefined;
        if (!schoolSnapshot.exists || (!orgYearSnapshot.exists && !schoolYearSnapshot.exists)) {
          throw new HttpsError("failed-precondition", "School or academic year was not found.");
        }
        if (
          existing &&
          enrollmentSnapshot.size > 0 &&
          (existing.schoolId !== schoolId || existing.academicYearId !== academicYearId)
        ) {
          throw new HttpsError(
            "failed-precondition",
            "A route with enrollment history cannot be moved to another school or academic year.",
          );
        }
        const status = readString(payload.status) || existing?.status || "ACTIVE";
        if (!ROUTE_STATUSES.has(status)) {
          throw new HttpsError("invalid-argument", "Route status is invalid.");
        }
        if (
          status === "ARCHIVED" &&
          enrollmentSnapshot.docs.some((document) =>
            ACTIVE_ENROLLMENT_STATUSES.has(readString(document.data().status)),
          )
        ) {
          throw new HttpsError("failed-precondition", "End or transfer active student enrollments before archiving this route.");
        }
        if (vehicleId) {
          const vehicle = vehicleSnapshot?.exists
            ? normalizeVehicle(vehicleSnapshot.id, orgId, data(vehicleSnapshot.data()))
            : undefined;
          if (!vehicle || vehicle.status === "ARCHIVED") {
            throw new HttpsError("failed-precondition", "Selected vehicle is not available.");
          }
        }
        const route = TransportRouteSchema.parse({
          id: routeId,
          orgId,
          schoolId,
          academicYearId,
          code: readString(payload.code) || undefined,
          title: readRequiredString(payload.title, "title"),
          shortTitle: readString(payload.shortTitle) || undefined,
          description: readString(payload.description) || undefined,
          vehicleId: vehicleId || undefined,
          driverPersonId: existing?.driverPersonId,
          supervisorPersonIds: existing?.supervisorPersonIds ?? [],
          areaLabel: readString(payload.areaLabel) || undefined,
          startsFromLabel: readString(payload.startsFromLabel) || undefined,
          endsAtLabel: readString(payload.endsAtLabel) || undefined,
          status,
          order: optionalNumber(payload.order),
          isArchived: status === "ARCHIVED",
          createdAt: existing?.createdAt || now,
          updatedAt: now,
        });
        transaction.set(ref, clean(route));
        return { id: routeId };
      });
    }

    if (action === "SET_ROUTE_SUPERVISORS") {
      const routeId = id(payload.routeId, "routeId");
      const personIds = Array.from(new Set(strings(payload.personIds)));
      const candidates = await loadStaffCandidates(orgId, personIds);
      const candidateIds = new Set(candidates.map((candidate) => candidate.personId));
      if (personIds.some((personId) => !candidateIds.has(personId))) {
        throw new HttpsError("failed-precondition", "A selected supervisor is not an active employee.");
      }
      const routeRef = db.doc(`orgs/${orgId}/transportRoutes/${routeId}`);
      return db.runTransaction(async (transaction) => {
        const [routeSnapshot, assignmentsSnapshot] = await Promise.all([
          transaction.get(routeRef),
          transaction.get(
            db.collection(`orgs/${orgId}/operationalAssignments`)
              .where("operationKind", "==", "TRANSPORT_ATTENDANCE"),
          ),
        ]);
        if (!routeSnapshot.exists) throw new HttpsError("not-found", "Transport route was not found.");
        const route = normalizeRoute(routeSnapshot.id, orgId, data(routeSnapshot.data()));
        if (!route || route.status === "ARCHIVED") {
          throw new HttpsError("failed-precondition", "Archived routes cannot receive supervisors.");
        }
        if (
          personIds.some((personId) => {
            const candidate = candidates.find((item) => item.personId === personId);
            return candidate && candidate.schoolIds.length > 0 &&
              !candidate.schoolIds.includes(route.schoolId ?? "");
          })
        ) {
          throw new HttpsError(
            "failed-precondition",
            "A selected supervisor is outside the route school scope.",
          );
        }
        const existing = assignmentsSnapshot.docs.filter((document) => {
          const assignment = data(document.data());
          return readString(assignment.scopeId) === routeId ||
            strings(assignment.targetRouteIds).includes(routeId);
        });
        const selected = new Set(personIds);
        const retainedByPerson = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
        existing
          .filter((document) => readString(document.data().status) === "ACTIVE")
          .forEach((document) => {
            const personId = readString(document.data().actorPersonId);
            if (selected.has(personId) && !retainedByPerson.has(personId)) {
              retainedByPerson.set(personId, document);
            }
          });
        existing.forEach((document) => {
          const personId = readString(document.data().actorPersonId);
          if (selected.has(personId) && !retainedByPerson.has(personId)) {
            retainedByPerson.set(personId, document);
          }
        });
        existing.forEach((document) => {
          const assignment = data(document.data());
          const personId = readString(assignment.actorPersonId);
          if (
            assignment.status === "ACTIVE" &&
            (!selected.has(personId) || retainedByPerson.get(personId)?.id !== document.id)
          ) {
            transaction.update(document.ref, {
              status: "ENDED",
              isActive: false,
              endAt: now,
              updatedAt: now,
            });
          }
        });
        personIds.forEach((personId) => {
          const candidate = candidates.find((item) => item.personId === personId);
          const prior = retainedByPerson.get(personId);
          const priorData = data(prior?.data());
          const assignmentId = prior?.id ?? `transport-route_${routeId}_${personId}`;
          const assignmentRef = db.doc(`orgs/${orgId}/operationalAssignments/${assignmentId}`);
          const assignment = clean({
            id: assignmentId,
            orgId,
            schoolId: route.schoolId ?? "",
            academicYearId: route.academicYearId ?? "",
            termId: "",
            gradeId: "",
            classId: "",
            subjectKey: "",
            classSubjectOfferingId: "",
            title: `الإشراف على ${route.title}`,
            description: "إسناد الإشراف على خط النقل المدرسي",
            status: "ACTIVE",
            isActive: true,
            startAt: readString(priorData.status) === "ACTIVE"
              ? optionalNumber(priorData.startAt) ?? now
              : now,
            actorPersonId: personId,
            actorMembershipId: "",
            actorRoleKey: candidate?.roleKey || undefined,
            operationKind: "TRANSPORT_ATTENDANCE",
            scopeType: "ROUTE",
            scopeId: routeId,
            scopeLabel: route.title,
            coverageMode: "SINGLE_SCOPE",
            targetKind: "ROUTE",
            targetPersonIds: [],
            targetStudentIds: [],
            targetClassIds: [],
            targetGradeIds: [],
            targetRouteIds: [routeId],
            targetRoleKeys: [],
            permissions: ["VIEW", "CREATE", "UPDATE_DRAFT", "SUBMIT"],
            sourceTeacherAssignmentId: "",
            sourceMembershipId: "",
            note: "",
            createdAt: optionalNumber(priorData.createdAt) ?? now,
            updatedAt: now,
          });
          transaction.set(
            assignmentRef,
            { ...assignment, endAt: FieldValue.delete() },
            { merge: true },
          );
        });
        transaction.update(routeRef, {
          supervisorPersonIds: personIds,
          updatedAt: now,
        });
        return { id: routeId };
      });
    }

    if (action === "UPSERT_STOP") {
      const stopId = optionalId(payload.id, "stopId") || db.collection(`orgs/${orgId}/transportRouteStops`).doc().id;
      const routeId = id(payload.routeId, "routeId");
      const ref = db.doc(`orgs/${orgId}/transportRouteStops/${stopId}`);
      return db.runTransaction(async (transaction) => {
        const [existingSnapshot, routeSnapshot] = await Promise.all([
          transaction.get(ref),
          transaction.get(db.doc(`orgs/${orgId}/transportRoutes/${routeId}`)),
        ]);
        if (!routeSnapshot.exists) throw new HttpsError("not-found", "Transport route was not found.");
        const route = normalizeRoute(routeSnapshot.id, orgId, data(routeSnapshot.data()));
        if (!route || route.status === "ARCHIVED") {
          throw new HttpsError("failed-precondition", "Archived routes cannot receive stops.");
        }
        const existing = existingSnapshot.exists
          ? normalizeStop(existingSnapshot.id, orgId, data(existingSnapshot.data()))
          : undefined;
        if (existing && existing.routeId !== routeId) {
          throw new HttpsError(
            "failed-precondition",
            "An existing stop cannot be moved to another route.",
          );
        }
        const kind = readString(payload.kind) || existing?.kind || "BOTH";
        if (!STOP_KINDS.has(kind)) throw new HttpsError("invalid-argument", "Stop kind is invalid.");
        const stop = TransportRouteStopSchema.parse({
          id: stopId,
          orgId,
          routeId,
          title: readRequiredString(payload.title, "title"),
          description: readString(payload.description) || undefined,
          kind,
          areaLabel: readString(payload.areaLabel) || undefined,
          addressText: readString(payload.addressText) || undefined,
          order: optionalNumber(payload.order) ?? 0,
          estimatedMorningTime: readString(payload.estimatedMorningTime) || undefined,
          estimatedAfternoonTime: readString(payload.estimatedAfternoonTime) || undefined,
          isActive: payload.isActive !== false,
          isArchived: false,
          createdAt: existing?.createdAt || now,
          updatedAt: now,
        });
        transaction.set(ref, clean(stop));
        return { id: stopId };
      });
    }

    if (action === "ARCHIVE_STOP") {
      const stopId = id(payload.stopId, "stopId");
      const ref = db.doc(`orgs/${orgId}/transportRouteStops/${stopId}`);
      return db.runTransaction(async (transaction) => {
        const stopSnapshot = await transaction.get(ref);
        if (!stopSnapshot.exists) throw new HttpsError("not-found", "Transport stop was not found.");
        const stop = normalizeStop(stopSnapshot.id, orgId, data(stopSnapshot.data()));
        if (!stop) throw new HttpsError("data-loss", "Transport stop is invalid.");
        const enrollmentsSnapshot = await transaction.get(
          db.collection(`orgs/${orgId}/studentTransportEnrollments`)
            .where("routeId", "==", stop.routeId),
        );
        const isUsed = enrollmentsSnapshot.docs.some((document) => {
          const item = data(document.data());
          return ACTIVE_ENROLLMENT_STATUSES.has(readString(item.status)) &&
            (readString(item.pickupStopId) === stopId || readString(item.dropoffStopId) === stopId);
        });
        if (isUsed) {
          throw new HttpsError("failed-precondition", "Move active students away from this stop before archiving it.");
        }
        transaction.update(ref, { isActive: false, isArchived: true, updatedAt: now });
        return { id: stopId };
      });
    }

    if (action === "CREATE_ENROLLMENT") {
      const studentId = id(payload.studentId, "studentId");
      const routeId = id(payload.routeId, "routeId");
      const startsAt = numberValue(payload.startsAt, now);
      const endsAt = optionalNumber(payload.endsAt);
      if (endsAt !== undefined && endsAt < startsAt) {
        throw new HttpsError("invalid-argument", "Enrollment end date precedes its start date.");
      }
      return createTransportEnrollment({
        orgId,
        routeId,
        studentId,
        pickupStopId: optionalId(payload.pickupStopId, "pickupStopId"),
        dropoffStopId: optionalId(payload.dropoffStopId, "dropoffStopId"),
        startsAt,
        endsAt,
        notes: readString(payload.notes),
        now,
      });
    }

    if (action === "CREATE_ENROLLMENTS_BULK") {
      const routeId = id(payload.routeId, "routeId");
      const studentIds = Array.from(new Set(strings(payload.studentIds)));
      if (!studentIds.length || studentIds.length > 100) {
        throw new HttpsError("invalid-argument", "Choose between one and 100 students.");
      }
      studentIds.forEach((studentId) => id(studentId, "studentId"));
      const startsAt = numberValue(payload.startsAt, now);
      const endsAt = optionalNumber(payload.endsAt);
      if (endsAt !== undefined && endsAt < startsAt) {
        throw new HttpsError("invalid-argument", "Enrollment end date precedes its start date.");
      }
      const shared = {
        orgId,
        routeId,
        pickupStopId: optionalId(payload.pickupStopId, "pickupStopId"),
        dropoffStopId: optionalId(payload.dropoffStopId, "dropoffStopId"),
        startsAt,
        endsAt,
        notes: readString(payload.notes),
        now,
      };
      const succeeded: Array<{ studentId: string; id: string }> = [];
      const skipped: Array<{ studentId: string; code: string; message: string }> = [];
      for (let index = 0; index < studentIds.length; index += 10) {
        const outcomes = await Promise.all(
          studentIds.slice(index, index + 10).map(async (studentId) => {
            try {
              const created = await createTransportEnrollment({ ...shared, studentId });
              return { studentId, created };
            } catch (error) {
              return { studentId, error: enrollmentFailure(error) };
            }
          }),
        );
        outcomes.forEach((outcome) => {
          if (outcome.created) {
            succeeded.push({ studentId: outcome.studentId, id: outcome.created.id });
          } else if (outcome.error) {
            skipped.push({ studentId: outcome.studentId, ...outcome.error });
          }
        });
      }
      return { succeeded, skipped };
    }

    if (action === "CHANGE_ENROLLMENT_STATUS") {
      const enrollmentId = id(payload.enrollmentId, "enrollmentId");
      const nextStatus = readString(payload.status);
      if (!["PAUSED", "ACTIVE", "ENDED"].includes(nextStatus)) {
        throw new HttpsError("invalid-argument", "Enrollment status transition is invalid.");
      }
      const ref = db.doc(`orgs/${orgId}/studentTransportEnrollments/${enrollmentId}`);
      return db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists) throw new HttpsError("not-found", "Transport enrollment was not found.");
        const enrollment = normalizeEnrollment(snapshot.id, orgId, data(snapshot.data()));
        if (!enrollment) throw new HttpsError("data-loss", "Transport enrollment is invalid.");
        const valid =
          (enrollment.status === "ACTIVE" && ["PAUSED", "ENDED"].includes(nextStatus)) ||
          (enrollment.status === "PAUSED" && ["ACTIVE", "ENDED"].includes(nextStatus));
        if (!valid) throw new HttpsError("failed-precondition", "Enrollment cannot move to the requested status.");
        if (nextStatus === "ACTIVE") {
          const others = await transaction.get(
            db.collection(`orgs/${orgId}/studentTransportEnrollments`).where("studentId", "==", enrollment.studentId),
          );
          const overlap = others.docs.some((document) => {
            if (document.id === enrollment.id) return false;
            const item = normalizeEnrollment(document.id, orgId, data(document.data()));
            return item && ACTIVE_ENROLLMENT_STATUSES.has(item.status) &&
              rangesOverlap(enrollment.startsAt ?? enrollment.createdAt, enrollment.endsAt, item.startsAt ?? item.createdAt, item.endsAt);
          });
          if (overlap) throw new HttpsError("already-exists", "Another overlapping transport enrollment is active.");
        }
        const enrollmentStart = enrollment.startsAt ?? enrollment.createdAt;
        const endedAt = nextStatus === "ENDED"
          ? Math.max(optionalNumber(payload.endsAt) ?? now, enrollmentStart)
          : undefined;
        transaction.update(ref, {
          status: nextStatus,
          ...(endedAt !== undefined ? { endsAt: endedAt } : {}),
          updatedAt: now,
        });
        return { id: enrollmentId };
      });
    }

    if (action === "TRANSFER_ENROLLMENT") {
      const enrollmentId = id(payload.enrollmentId, "enrollmentId");
      const targetRouteId = id(payload.targetRouteId, "targetRouteId");
      const operationId = id(payload.operationId, "operationId");
      const transferAt = numberValue(payload.transferAt, now);
      const targetRef = db.doc(`orgs/${orgId}/studentTransportEnrollments/transport-transfer_${operationId}`);
      const sourceRef = db.doc(`orgs/${orgId}/studentTransportEnrollments/${enrollmentId}`);
      return db.runTransaction(async (transaction) => {
        const [sourceSnapshot, targetSnapshot, routeSnapshot] = await Promise.all([
          transaction.get(sourceRef),
          transaction.get(targetRef),
          transaction.get(db.doc(`orgs/${orgId}/transportRoutes/${targetRouteId}`)),
        ]);
        if (targetSnapshot.exists) return { id: targetSnapshot.id };
        if (!sourceSnapshot.exists) throw new HttpsError("not-found", "Source transport enrollment was not found.");
        const source = normalizeEnrollment(sourceSnapshot.id, orgId, data(sourceSnapshot.data()));
        const route = routeSnapshot.exists
          ? normalizeRoute(routeSnapshot.id, orgId, data(routeSnapshot.data()))
          : undefined;
        if (!source || !ACTIVE_ENROLLMENT_STATUSES.has(source.status)) {
          throw new HttpsError("failed-precondition", "Only active or paused enrollments can be transferred.");
        }
        if (!route || route.status !== "ACTIVE" || route.id === source.routeId) {
          throw new HttpsError("failed-precondition", "Choose a different active target route.");
        }
        if (transferAt < (source.startsAt ?? source.createdAt)) {
          throw new HttpsError("invalid-argument", "Transfer date precedes the source enrollment.");
        }
        if (source.endsAt !== undefined && transferAt > source.endsAt) {
          throw new HttpsError("invalid-argument", "Transfer date follows the source enrollment end date.");
        }
        const placement = await validateStudentPlacement({ transaction, orgId, studentId: source.studentId, route });
        const others = await transaction.get(
          db.collection(`orgs/${orgId}/studentTransportEnrollments`).where("studentId", "==", source.studentId),
        );
        const overlap = others.docs.some((document) => {
          if (document.id === source.id) return false;
          const item = normalizeEnrollment(document.id, orgId, data(document.data()));
          return item && ACTIVE_ENROLLMENT_STATUSES.has(item.status) &&
            rangesOverlap(transferAt, source.endsAt, item.startsAt ?? item.createdAt, item.endsAt);
        });
        if (overlap) throw new HttpsError("already-exists", "Another overlapping transport enrollment exists.");
        const pickupStopId = optionalId(payload.pickupStopId, "pickupStopId");
        const dropoffStopId = optionalId(payload.dropoffStopId, "dropoffStopId");
        const stops = await validateStops({ transaction, orgId, routeId: route.id, pickupStopId, dropoffStopId });
        const next = StudentTransportEnrollmentSchema.parse({
          id: targetRef.id,
          orgId,
          schoolId: route.schoolId,
          academicYearId: route.academicYearId || placement.academicYearId,
          studentId: source.studentId,
          studentPersonId: source.studentPersonId || placement.personId || undefined,
          studentDisplayName: source.studentDisplayName || placement.displayName,
          guardianPersonId: source.guardianPersonId,
          guardianDisplayName: source.guardianDisplayName,
          guardianPhone: source.guardianPhone,
          routeId: route.id,
          routeTitle: route.title,
          pickupStopId: pickupStopId || undefined,
          pickupStopTitle: stops.get(pickupStopId)?.title,
          dropoffStopId: dropoffStopId || undefined,
          dropoffStopTitle: stops.get(dropoffStopId)?.title,
          status: "ACTIVE",
          startsAt: transferAt,
          endsAt: source.endsAt,
          notes: readString(payload.notes) || undefined,
          createdAt: now,
          updatedAt: now,
        });
        transaction.update(sourceRef, {
          status: "ENDED",
          endsAt: Math.max(source.startsAt ?? source.createdAt, transferAt - 1),
          updatedAt: now,
          notes: [source.notes, `نُقل إلى ${route.title}`].filter(Boolean).join(" — "),
        });
        transaction.create(targetRef, clean(next));
        return { id: targetRef.id };
      });
    }

    throw new HttpsError("invalid-argument", "Transport administration action is invalid.");
  },
);
