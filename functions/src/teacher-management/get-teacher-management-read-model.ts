import { getFirestore, type DocumentReference } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import { TeacherProvisioningRoleKey } from "@takween/contracts";

import {
  canManageOrg,
  getActiveMembership,
  isActiveMembership,
  membershipRoleKey,
  membershipSchoolIds,
  readString,
  type FirestoreRecord,
} from "../staff-chat/shared";

const REGION = "me-central2";
const TEACHER_ROLE_KEYS = new Set(["teacher", ...TeacherProvisioningRoleKey.options]);

type CanonicalMembershipRecord = {
  uid: string;
  personId: string;
  data: FirestoreRecord;
};

type AssignmentRecord = {
  id: string;
  schoolId: string;
  academicYearId: string;
  termId: string;
  classId: string;
  classSubjectOfferingId: string;
  subjectKey: string;
  subjectTitle: string;
  status: string;
  active: boolean | null;
  startAt: number;
  endAt: number;
  endedAt: number;
  createdAt: number;
  updatedAt: number;
};

type AssignmentLabels = {
  school: string;
  academicYear: string;
  term: string;
  className: string;
  subject: string;
};

function readRecord(value: unknown): FirestoreRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as FirestoreRecord)
    : {};
}

function readNumber(data: FirestoreRecord, field: string): number {
  const value = data[field];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function labelFor(data: FirestoreRecord, fallback: string): string {
  return (
    readString(data.nameAr) ||
    readString(data.title) ||
    readString(data.name) ||
    readString(data.shortName) ||
    readString(data.nameEn) ||
    readString(data.displayName) ||
    fallback
  );
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function validDocumentId(value: string): boolean {
  return Boolean(value) && !value.includes("/");
}

function isTeacherMembership(data: FirestoreRecord): boolean {
  return TEACHER_ROLE_KEYS.has(membershipRoleKey(data));
}

function toMembership(record: CanonicalMembershipRecord, schoolNames: Map<string, string>) {
  const schoolIds = membershipSchoolIds(record.data);

  return {
    uid: record.uid,
    role: readString(record.data.role),
    roleKey: membershipRoleKey(record.data),
    title: readString(record.data.title),
    isActive: isActiveMembership(record.data),
    schoolIds,
    schoolNames: schoolIds.map((schoolId) => schoolNames.get(schoolId) || schoolId),
  };
}

function toAssignment(id: string, data: FirestoreRecord): AssignmentRecord {
  return {
    id,
    schoolId: readString(data.schoolId),
    academicYearId: readString(data.academicYearId),
    termId: readString(data.termId),
    classId: readString(data.classId) || readString(data.targetScopeId),
    classSubjectOfferingId: readString(data.classSubjectOfferingId),
    subjectKey: readString(data.subjectKey),
    subjectTitle: readString(data.subjectTitle),
    status: readString(data.status),
    active: typeof data.active === "boolean" ? data.active : null,
    startAt: readNumber(data, "startAt"),
    endAt: readNumber(data, "endAt"),
    endedAt: readNumber(data, "endedAt"),
    createdAt: readNumber(data, "createdAt"),
    updatedAt: readNumber(data, "updatedAt"),
  };
}

function isCurrentAssignment(assignment: AssignmentRecord, now: number): boolean {
  return (
    assignment.status === "ACTIVE" &&
    assignment.active === true &&
    (!assignment.startAt || assignment.startAt <= now) &&
    (!assignment.endAt || assignment.endAt >= now)
  );
}

function newestAssignmentFirst(left: AssignmentRecord, right: AssignmentRecord): number {
  const leftDate = Math.max(left.endedAt, left.updatedAt, left.createdAt, left.startAt);
  const rightDate = Math.max(right.endedAt, right.updatedAt, right.createdAt, right.startAt);
  return rightDate - leftDate || right.id.localeCompare(left.id);
}

function membershipUid(snapshot: { ref: DocumentReference }): string {
  const userRef = snapshot.ref.parent.parent;
  return userRef?.parent.id === "users" ? userRef.id : "";
}

async function loadCanonicalTeacherMemberships(orgId: string): Promise<CanonicalMembershipRecord[]> {
  const snapshot = await getFirestore()
    .collectionGroup("orgMemberships")
    .where("orgId", "==", orgId)
    .get();

  return snapshot.docs.flatMap((document) => {
    const data = readRecord(document.data());
    const uid = membershipUid(document);
    const personId = readString(data.personId);
    return uid && personId && isTeacherMembership(data) ? [{ uid, personId, data }] : [];
  });
}

async function assertDirectoryAccess(uid: string, orgId: string) {
  const membership = await getActiveMembership({ db: getFirestore(), orgId, uid });
  if (!canManageOrg(membership)) {
    throw new HttpsError("permission-denied", "Organization administrator access is required.");
  }
}

function readInputId(value: unknown, fieldName: string): string {
  const id = readString(value);
  if (!validDocumentId(id)) {
    throw new HttpsError("invalid-argument", `${fieldName} is required.`);
  }
  return id;
}

async function loadSchoolNames(orgId: string): Promise<Map<string, string>> {
  const snapshot = await getFirestore().collection(`orgs/${orgId}/schools`).get();
  return new Map(snapshot.docs.map((document) => [document.id, labelFor(readRecord(document.data()), document.id)]));
}

async function loadUserProfiles(uids: string[]): Promise<Map<string, FirestoreRecord>> {
  if (uids.length === 0) return new Map();
  const db = getFirestore();
  const snapshots = await db.getAll(...uids.map((uid) => db.doc(`users/${uid}`)));
  return new Map(snapshots.filter((snapshot) => snapshot.exists).map((snapshot) => [snapshot.id, readRecord(snapshot.data())]));
}

async function loadPeople(orgId: string, personIds: string[]): Promise<Map<string, FirestoreRecord>> {
  if (personIds.length === 0) return new Map();
  const db = getFirestore();
  const snapshots = await db.getAll(...personIds.map((personId) => db.doc(`orgs/${orgId}/people/${personId}`)));
  return new Map(snapshots.filter((snapshot) => snapshot.exists).map((snapshot) => [snapshot.id, readRecord(snapshot.data())]));
}

async function loadAssignmentsForDirectory(orgId: string): Promise<Map<string, AssignmentRecord[]>> {
  const snapshot = await getFirestore().collection(`orgs/${orgId}/teacherAssignments`).get();
  const assignments = new Map<string, AssignmentRecord[]>();
  snapshot.docs.forEach((document) => {
    const data = readRecord(document.data());
    const personId = readString(data.teacherPersonId);
    if (!personId) return;
    const rows = assignments.get(personId) || [];
    rows.push(toAssignment(document.id, data));
    assignments.set(personId, rows);
  });
  return assignments;
}

function choosePrimaryMembership(records: CanonicalMembershipRecord[]): CanonicalMembershipRecord {
  return [...records].sort((left, right) => {
    const activeDifference = Number(isActiveMembership(right.data)) - Number(isActiveMembership(left.data));
    return activeDifference || left.uid.localeCompare(right.uid);
  })[0]!;
}

function membershipIdentityMismatch(membership: CanonicalMembershipRecord, user: FirestoreRecord | undefined): boolean {
  const userPersonId = readString(user?.personId);
  return Boolean(userPersonId && userPersonId !== membership.personId);
}

export type TeacherDirectoryReadModel = {
  orgName: string;
  schools: Array<{ id: string; name: string }>;
  rows: Array<{
    personId: string;
    displayName: string;
    email: string;
    employeeNumber: string;
    membership: ReturnType<typeof toMembership>;
    membershipCount: number;
    hasIdentityMismatch: boolean;
    schoolIds: string[];
    schoolNames: string[];
    activeAssignmentCount: number;
  }>;
};

async function buildTeacherDirectory(orgId: string): Promise<TeacherDirectoryReadModel | null> {
  const db = getFirestore();
  const [orgSnapshot, schoolNames, memberships, assignmentsByPerson] = await Promise.all([
    db.doc(`orgs/${orgId}`).get(),
    loadSchoolNames(orgId),
    loadCanonicalTeacherMemberships(orgId),
    loadAssignmentsForDirectory(orgId),
  ]);
  if (!orgSnapshot.exists) return null;

  const membershipsByPerson = new Map<string, CanonicalMembershipRecord[]>();
  memberships.forEach((membership) => {
    const records = membershipsByPerson.get(membership.personId) || [];
    records.push(membership);
    membershipsByPerson.set(membership.personId, records);
  });

  const [users, people] = await Promise.all([
    loadUserProfiles(unique(memberships.map((membership) => membership.uid))),
    loadPeople(orgId, Array.from(membershipsByPerson.keys())),
  ]);
  const now = Date.now();

  const rows = Array.from(membershipsByPerson.entries())
    .flatMap(([personId, teacherMemberships]) => {
      const person = people.get(personId);
      if (!person) return [];
      const primaryMembership = choosePrimaryMembership(teacherMemberships);
      const primaryUser = users.get(primaryMembership.uid);
      const activeAssignments = (assignmentsByPerson.get(personId) || []).filter((assignment) => isCurrentAssignment(assignment, now));
      const schoolIds = unique([
        ...teacherMemberships.flatMap((membership) => membershipSchoolIds(membership.data)),
        ...activeAssignments.map((assignment) => assignment.schoolId),
      ]);

      return [{
        personId,
        displayName: readString(person.displayName) || personId,
        email: readString(person.email) || readString(primaryUser?.email),
        employeeNumber: readString(person.employeeNumber),
        membership: toMembership(primaryMembership, schoolNames),
        membershipCount: teacherMemberships.length,
        hasIdentityMismatch: teacherMemberships.some((membership) => membershipIdentityMismatch(membership, users.get(membership.uid))),
        schoolIds,
        schoolNames: schoolIds.map((schoolId) => schoolNames.get(schoolId) || schoolId),
        activeAssignmentCount: activeAssignments.length,
      }];
    })
    .sort((left, right) => left.displayName.localeCompare(right.displayName, "ar"));

  return {
    orgName: labelFor(readRecord(orgSnapshot.data()), orgId),
    schools: Array.from(schoolNames.entries()).map(([id, name]) => ({ id, name })).sort((left, right) => left.name.localeCompare(right.name, "ar")),
    rows,
  };
}

async function loadAssignmentLabels(params: {
  orgId: string;
  assignments: AssignmentRecord[];
  schoolNames: Map<string, string>;
}) {
  const db = getFirestore();
  const schoolYearRefs = new Map<string, DocumentReference>();
  const termRefs = new Map<string, DocumentReference>();
  const classRefs = new Map<string, DocumentReference>();
  const offeringRefs = new Map<string, DocumentReference>();

  params.assignments.forEach((assignment) => {
    if (!validDocumentId(assignment.schoolId) || !validDocumentId(assignment.academicYearId)) return;
    const contextKey = `${assignment.schoolId}::${assignment.academicYearId}`;
    schoolYearRefs.set(contextKey, db.doc(`orgs/${params.orgId}/schools/${assignment.schoolId}/academicYears/${assignment.academicYearId}`));
    if (validDocumentId(assignment.termId)) {
      termRefs.set(`${assignment.academicYearId}::${assignment.termId}`, db.doc(`orgs/${params.orgId}/academicYears/${assignment.academicYearId}/terms/${assignment.termId}`));
    }
    if (validDocumentId(assignment.classId)) {
      classRefs.set(`${contextKey}::${assignment.classId}`, db.doc(`orgs/${params.orgId}/schools/${assignment.schoolId}/academicYears/${assignment.academicYearId}/classes/${assignment.classId}`));
    }
    if (validDocumentId(assignment.classSubjectOfferingId)) {
      offeringRefs.set(assignment.classSubjectOfferingId, db.doc(`orgs/${params.orgId}/classSubjectOfferings/${assignment.classSubjectOfferingId}`));
    }
  });

  const [years, terms, classes, offerings] = await Promise.all([
    schoolYearRefs.size ? db.getAll(...Array.from(schoolYearRefs.values())) : Promise.resolve([]),
    termRefs.size ? db.getAll(...Array.from(termRefs.values())) : Promise.resolve([]),
    classRefs.size ? db.getAll(...Array.from(classRefs.values())) : Promise.resolve([]),
    offeringRefs.size ? db.getAll(...Array.from(offeringRefs.values())) : Promise.resolve([]),
  ]);
  const yearNames = new Map(years.map((snapshot) => [snapshot.ref.path, labelFor(readRecord(snapshot.data()), snapshot.id)]));
  const termNames = new Map(terms.map((snapshot) => [snapshot.ref.path, labelFor(readRecord(snapshot.data()), snapshot.id)]));
  const classNames = new Map(classes.map((snapshot) => [snapshot.ref.path, labelFor(readRecord(snapshot.data()), snapshot.id)]));
  const offeringNames = new Map(offerings.map((snapshot) => {
    const data = readRecord(snapshot.data());
    return [snapshot.ref.path, readString(data.subjectTitleSnapshot) || readString(data.subjectTitle) || readString(data.displayName) || readString(data.subjectKey) || snapshot.id];
  }));

  return params.assignments.map((assignment) => {
    const yearPath = `orgs/${params.orgId}/schools/${assignment.schoolId}/academicYears/${assignment.academicYearId}`;
    const termPath = `orgs/${params.orgId}/academicYears/${assignment.academicYearId}/terms/${assignment.termId}`;
    const classPath = `${yearPath}/classes/${assignment.classId}`;
    const offeringPath = `orgs/${params.orgId}/classSubjectOfferings/${assignment.classSubjectOfferingId}`;
    return {
      ...assignment,
      labels: {
        school: params.schoolNames.get(assignment.schoolId) || assignment.schoolId,
        academicYear: yearNames.get(yearPath) || assignment.academicYearId,
        term: termNames.get(termPath) || assignment.termId,
        className: classNames.get(classPath) || assignment.classId,
        subject: offeringNames.get(offeringPath) || assignment.subjectTitle || assignment.subjectKey,
      },
    };
  });
}

export type TeacherProfileReadModel = {
  identity: { personId: string; displayName: string; nationalId: string; phone: string; email: string };
  account: {
    uid: string;
    userProfileEmail: string;
    userProfileExists: boolean;
    membership: ReturnType<typeof toMembership>;
    membershipCount: number;
    mirror: { exists: boolean; roleKey: string; isActive: boolean | null; schoolIds: string[]; differs: boolean };
    diagnostics: string[];
  };
  currentAssignments: Array<AssignmentRecord & { labels: AssignmentLabels }>;
  assignmentHistory: Array<AssignmentRecord & { labels: AssignmentLabels }>;
};

async function buildTeacherProfile(params: { orgId: string; personId: string }): Promise<TeacherProfileReadModel | null> {
  const db = getFirestore();
  const memberships = (await loadCanonicalTeacherMemberships(params.orgId)).filter((membership) => membership.personId === params.personId);
  if (memberships.length === 0) return null;

  const primaryMembership = choosePrimaryMembership(memberships);
  const [schoolNames, personSnapshot, users, legacyMembershipSnapshot, assignmentSnapshot] = await Promise.all([
    loadSchoolNames(params.orgId),
    db.doc(`orgs/${params.orgId}/people/${params.personId}`).get(),
    loadUserProfiles(unique(memberships.map((membership) => membership.uid))),
    db.doc(`orgs/${params.orgId}/memberships/${primaryMembership.uid}`).get(),
    db.collection(`orgs/${params.orgId}/teacherAssignments`).where("teacherPersonId", "==", params.personId).get(),
  ]);
  if (!personSnapshot.exists) return null;

  const primaryUser = users.get(primaryMembership.uid);
  const person = readRecord(personSnapshot.data());
  const legacyMembership = legacyMembershipSnapshot.exists ? readRecord(legacyMembershipSnapshot.data()) : null;
  const canonicalMembership = toMembership(primaryMembership, schoolNames);
  const assignments = assignmentSnapshot.docs.map((document) => toAssignment(document.id, readRecord(document.data())));
  const history = (await loadAssignmentLabels({ orgId: params.orgId, assignments, schoolNames })).sort(newestAssignmentFirst);
  const now = Date.now();
  const diagnostics: string[] = [];
  if (!primaryUser) diagnostics.push("ملف المستخدم المرتبط بالحساب غير موجود.");
  if (membershipIdentityMismatch(primaryMembership, primaryUser)) diagnostics.push("معرّف الشخص في ملف المستخدم لا يطابق العضوية الأساسية.");
  if (memberships.length > 1) diagnostics.push("يوجد أكثر من حساب عضوية أساسي مرتبط بهذا الشخص.");

  const legacySchoolIds = legacyMembership ? membershipSchoolIds(legacyMembership) : [];
  const legacyRoleKey = legacyMembership ? membershipRoleKey(legacyMembership) : "";
  const legacyIsActive = legacyMembership ? isActiveMembership(legacyMembership) : null;
  const mirrorDiffers = Boolean(legacyMembership && (legacyRoleKey !== canonicalMembership.roleKey || legacyIsActive !== canonicalMembership.isActive || legacySchoolIds.slice().sort().join("|") !== canonicalMembership.schoolIds.slice().sort().join("|")));
  if (mirrorDiffers) diagnostics.push("العضوية الموروثة لا تطابق العضوية الأساسية.");

  return {
    identity: {
      personId: params.personId,
      displayName: readString(person.displayName) || params.personId,
      nationalId: readString(person.nationalId),
      phone: readString(person.phone),
      email: readString(person.email) || readString(primaryUser?.email),
    },
    account: {
      uid: primaryMembership.uid,
      userProfileEmail: readString(primaryUser?.email),
      userProfileExists: Boolean(primaryUser),
      membership: canonicalMembership,
      membershipCount: memberships.length,
      mirror: { exists: Boolean(legacyMembership), roleKey: legacyRoleKey, isActive: legacyIsActive, schoolIds: legacySchoolIds, differs: mirrorDiffers },
      diagnostics,
    },
    currentAssignments: history.filter((assignment) => isCurrentAssignment(assignment, now)),
    assignmentHistory: history,
  };
}

export const getTeacherDirectory = onCall(
  { region: REGION, cors: true, invoker: "public" },
  async (request): Promise<TeacherDirectoryReadModel | null> => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Authentication is required.");
    const orgId = readInputId(readRecord(request.data).orgId, "orgId");
    await assertDirectoryAccess(uid, orgId);
    return buildTeacherDirectory(orgId);
  },
);

export const getTeacherProfile = onCall(
  { region: REGION, cors: true, invoker: "public" },
  async (request): Promise<TeacherProfileReadModel | null> => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Authentication is required.");
    const input = readRecord(request.data);
    const orgId = readInputId(input.orgId, "orgId");
    const personId = readInputId(input.personId, "personId");
    await assertDirectoryAccess(uid, orgId);
    return buildTeacherProfile({ orgId, personId });
  },
);
