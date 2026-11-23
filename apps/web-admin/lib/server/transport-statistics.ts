import "server-only";

import type { Firestore } from "firebase-admin/firestore";

type FirestoreRecord = Record<string, unknown>;

export type TransportStatisticsMode = "current" | "year";

export type TransportAcademicYearOption = {
  id: string;
  title: string;
};

export type TransportStatisticsRow = {
  schoolId: string;
  schoolName: string;
  routeId: string;
  routeTitle: string;
  supervisorNames: string;
  driverName: string;
  supervisorPersonIds: string[];
  studentCount: number;
};

export type TransportStatisticsSchoolGroup = {
  schoolId: string;
  schoolName: string;
  rows: TransportStatisticsRow[];
  totalStudents: number;
};

export type TransportStatisticsReport = {
  scope: {
    mode: TransportStatisticsMode;
    academicYearId: string | null;
    title: string;
  };
  summary: {
    schoolCount: number;
    routeCount: number;
    supervisorCount: number;
    studentCount: number;
  };
  groups: TransportStatisticsSchoolGroup[];
};

type RouteRecord = {
  id: string;
  schoolId: string;
  academicYearId: string;
  title: string;
  vehicleId: string;
  status: string;
  isArchived: boolean;
  order: number;
  supervisorPersonIds: string[];
};

type EnrollmentRecord = {
  studentId: string;
  routeId: string;
  academicYearId: string;
  status: string;
  startsAt: number | null;
  endsAt: number | null;
};

type AssignmentRecord = {
  actorPersonId: string;
  scopeType: string;
  scopeId: string;
  targetRouteIds: string[];
  operationKind: string;
  status: string;
  isActive: boolean;
};

const CURRENT_ENROLLMENT_STATUSES = new Set(["ACTIVE", "PAUSED"]);
const HISTORICAL_ENROLLMENT_STATUSES = new Set(["ACTIVE", "PAUSED", "ENDED"]);

function asRecord(value: unknown): FirestoreRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as FirestoreRecord)
    : {};
}

function readString(data: FirestoreRecord, field: string) {
  const value = data[field];
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(data: FirestoreRecord, ...fields: string[]) {
  for (const field of fields) {
    const value = data[field];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

function readStrings(data: FirestoreRecord, field: string) {
  const value = data[field];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && !!item.trim()).map((item) => item.trim())
    : [];
}

function labelFor(data: FirestoreRecord, fallback: string) {
  return (
    readString(data, "displayName") ||
    readString(data, "nameAr") ||
    readString(data, "title") ||
    readString(data, "name") ||
    readString(data, "shortTitle") ||
    readString(data, "shortName") ||
    readString(data, "code") ||
    fallback
  );
}

function normalizeRoute(id: string, data: FirestoreRecord): RouteRecord {
  const status = readString(data, "status").toUpperCase() || (data.isActive === false ? "INACTIVE" : "ACTIVE");
  return {
    id,
    schoolId: readString(data, "schoolId"),
    academicYearId: readString(data, "academicYearId"),
    title: labelFor(data, id),
    vehicleId: readString(data, "vehicleId"),
    status,
    isArchived: data.isArchived === true || status === "ARCHIVED",
    order: readNumber(data, "order") ?? 0,
    supervisorPersonIds: readStrings(data, "supervisorPersonIds"),
  };
}

function normalizeEnrollment(data: FirestoreRecord): EnrollmentRecord {
  return {
    studentId: readString(data, "studentId"),
    routeId: readString(data, "routeId"),
    academicYearId: readString(data, "academicYearId"),
    status: readString(data, "status").toUpperCase() || "ACTIVE",
    startsAt: readNumber(data, "startsAt", "startAt"),
    endsAt: readNumber(data, "endsAt", "endAt"),
  };
}

function normalizeAssignment(data: FirestoreRecord): AssignmentRecord {
  return {
    actorPersonId: readString(data, "actorPersonId"),
    scopeType: readString(data, "scopeType").toUpperCase(),
    scopeId: readString(data, "scopeId"),
    targetRouteIds: readStrings(data, "targetRouteIds"),
    operationKind: readString(data, "operationKind"),
    status: readString(data, "status").toUpperCase(),
    isActive: data.isActive !== false,
  };
}

function isCurrentEnrollment(enrollment: EnrollmentRecord, now: number) {
  return (
    CURRENT_ENROLLMENT_STATUSES.has(enrollment.status) &&
    (enrollment.startsAt === null || enrollment.startsAt <= now) &&
    (enrollment.endsAt === null || enrollment.endsAt >= now)
  );
}

function routeSupervisorIds(route: RouteRecord, assignments: AssignmentRecord[]) {
  const assignedIds = assignments
    .filter((assignment) => assignment.operationKind === "TRANSPORT_ATTENDANCE")
    .filter((assignment) => assignment.status === "ACTIVE" && assignment.isActive)
    .filter((assignment) =>
      (assignment.scopeType === "ROUTE" && assignment.scopeId === route.id) ||
      assignment.targetRouteIds.includes(route.id),
    )
    .map((assignment) => assignment.actorPersonId);

  return Array.from(new Set([...route.supervisorPersonIds, ...assignedIds].filter(Boolean)));
}

async function loadSchools(db: Firestore, orgId: string) {
  const snapshot = await db.collection(`orgs/${orgId}/schools`).get();
  return new Map(snapshot.docs.map((item) => [item.id, labelFor(asRecord(item.data()), item.id)]));
}

export async function loadTransportAcademicYears(params: {
  db: Firestore;
  orgId: string;
}): Promise<TransportAcademicYearOption[]> {
  const schools = await loadSchools(params.db, params.orgId);
  const years = new Map<string, TransportAcademicYearOption>();
  const [orgYears, ...schoolYears] = await Promise.all([
    params.db.collection(`orgs/${params.orgId}/academicYears`).get(),
    ...Array.from(schools.keys()).map((schoolId) =>
      params.db.collection(`orgs/${params.orgId}/schools/${schoolId}/academicYears`).get(),
    ),
  ]);

  orgYears.docs.forEach((item) => {
    years.set(item.id, { id: item.id, title: labelFor(asRecord(item.data()), item.id) });
  });
  schoolYears.forEach((snapshot) => {
    snapshot.docs.forEach((item) => {
      if (!years.has(item.id)) {
        years.set(item.id, { id: item.id, title: labelFor(asRecord(item.data()), item.id) });
      }
    });
  });

  return Array.from(years.values()).sort((left, right) => right.title.localeCompare(left.title, "ar"));
}

async function loadPeopleById(params: {
  db: Firestore;
  orgId: string;
  personIds: string[];
}) {
  const people = new Map<string, string>();
  const ids = Array.from(new Set(params.personIds.filter(Boolean)));

  for (let index = 0; index < ids.length; index += 100) {
    const snapshots = await params.db.getAll(
      ...ids.slice(index, index + 100).map((personId) =>
        params.db.doc(`orgs/${params.orgId}/people/${personId}`),
      ),
    );
    snapshots.forEach((snapshot) => {
      if (snapshot.exists) people.set(snapshot.id, labelFor(asRecord(snapshot.data()), snapshot.id));
    });
  }

  return people;
}

export async function buildTransportStatisticsReport(params: {
  db: Firestore;
  orgId: string;
  mode: TransportStatisticsMode;
  academicYearId?: string;
  now?: number;
}): Promise<TransportStatisticsReport> {
  const academicYearId = params.academicYearId?.trim() || "";
  if (params.mode === "year" && !academicYearId) throw new Error("ACADEMIC_YEAR_REQUIRED");

  const [schools, academicYears, routesSnapshot, vehiclesSnapshot, assignmentsSnapshot, enrollmentsSnapshot] = await Promise.all([
    loadSchools(params.db, params.orgId),
    loadTransportAcademicYears({ db: params.db, orgId: params.orgId }),
    params.db.collection(`orgs/${params.orgId}/transportRoutes`).get(),
    params.db.collection(`orgs/${params.orgId}/transportVehicles`).get(),
    params.db.collection(`orgs/${params.orgId}/operationalAssignments`).where("operationKind", "==", "TRANSPORT_ATTENDANCE").get(),
    params.mode === "current"
      ? params.db.collection(`orgs/${params.orgId}/studentTransportEnrollments`).where("status", "in", ["ACTIVE", "PAUSED"]).get()
      : params.db.collection(`orgs/${params.orgId}/studentTransportEnrollments`).where("academicYearId", "==", academicYearId).get(),
  ]);

  if (params.mode === "year" && !academicYears.some((year) => year.id === academicYearId)) {
    throw new Error("ACADEMIC_YEAR_NOT_FOUND");
  }

  const routes = routesSnapshot.docs.map((item) => normalizeRoute(item.id, asRecord(item.data())));
  const selectedRoutes = routes
    .filter((route) => params.mode === "current"
      ? !route.isArchived
      : route.academicYearId === academicYearId)
    .sort((left, right) =>
      (params.mode === "current" ? Number(right.status === "ACTIVE") - Number(left.status === "ACTIVE") : 0) ||
      left.order - right.order ||
      left.title.localeCompare(right.title, "ar"),
    );
  const selectedRouteIds = new Set(selectedRoutes.map((route) => route.id));
  const enrollments = enrollmentsSnapshot.docs
    .map((item) => normalizeEnrollment(asRecord(item.data())))
    .filter((enrollment) => enrollment.studentId && selectedRouteIds.has(enrollment.routeId))
    .filter((enrollment) => params.mode === "current"
      ? isCurrentEnrollment(enrollment, params.now ?? Date.now())
      : HISTORICAL_ENROLLMENT_STATUSES.has(enrollment.status));
  const studentIdsByRoute = new Map<string, Set<string>>();
  enrollments.forEach((enrollment) => {
    const studentIds = studentIdsByRoute.get(enrollment.routeId) ?? new Set<string>();
    studentIds.add(enrollment.studentId);
    studentIdsByRoute.set(enrollment.routeId, studentIds);
  });

  const assignments = assignmentsSnapshot.docs.map((item) => normalizeAssignment(asRecord(item.data())));
  const supervisorIdsByRoute = new Map(
    selectedRoutes.map((route) => [route.id, routeSupervisorIds(route, assignments)]),
  );
  const peopleById = await loadPeopleById({
    db: params.db,
    orgId: params.orgId,
    personIds: Array.from(supervisorIdsByRoute.values()).flat(),
  });
  const vehicleDriverById = new Map(
    vehiclesSnapshot.docs.map((item) => [item.id, readString(asRecord(item.data()), "plateNumber")]),
  );

  const rows = selectedRoutes.map((route) => {
    const supervisorPersonIds = supervisorIdsByRoute.get(route.id) ?? [];
    return {
      schoolId: route.schoolId,
      schoolName: schools.get(route.schoolId) ?? (route.schoolId || "غير محدد"),
      routeId: route.id,
      routeTitle: route.title,
      supervisorNames: supervisorPersonIds.length
        ? supervisorPersonIds.map((personId) => peopleById.get(personId) ?? personId).join("، ")
        : "غير محدد",
      driverName: vehicleDriverById.get(route.vehicleId) || "غير محدد",
      supervisorPersonIds,
      studentCount: studentIdsByRoute.get(route.id)?.size ?? 0,
    } satisfies TransportStatisticsRow;
  });

  const groupsBySchool = new Map<string, TransportStatisticsSchoolGroup>();
  rows.forEach((row) => {
    const group = groupsBySchool.get(row.schoolId) ?? {
      schoolId: row.schoolId,
      schoolName: row.schoolName,
      rows: [],
      totalStudents: 0,
    };
    group.rows.push(row);
    group.totalStudents += row.studentCount;
    groupsBySchool.set(row.schoolId, group);
  });
  const groups = Array.from(groupsBySchool.values()).sort((left, right) => left.schoolName.localeCompare(right.schoolName, "ar"));
  const selectedYear = academicYears.find((year) => year.id === academicYearId);

  return {
    scope: {
      mode: params.mode,
      academicYearId: params.mode === "year" ? academicYearId : null,
      title: params.mode === "current" ? "الوضع الحالي" : selectedYear?.title || academicYearId,
    },
    summary: {
      schoolCount: groups.length,
      routeCount: rows.length,
      supervisorCount: new Set(rows.flatMap((row) => row.supervisorPersonIds)).size,
      studentCount: groups.reduce((total, group) => total + group.totalStudents, 0),
    },
    groups,
  };
}
