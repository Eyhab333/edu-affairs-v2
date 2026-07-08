import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

const REGION = "me-central2";

type RegisterStudentInActivityInput = {
  orgId?: unknown;
  activityId?: unknown;
  studentId?: unknown;
  guardianConsentAccepted?: unknown;
};

type ActivityRow = {
  id?: string;
  orgId?: string;
  schoolId?: string;
  academicYearId?: string;
  title?: string;
  status?: string;
  registrationOpensAt?: number;
  registrationClosesAt?: number;
  capacity?: number;
  allowWaitlist?: boolean;
  registeredCount?: number;
  confirmedCount?: number;
  waitlistedCount?: number;
  requiresGuardianConsent?: boolean;
  consentText?: string;
  targetAudience?: Record<string, unknown>;
};

type StudentEnrollmentRow = {
  id: string;
  studentId?: string;
  schoolId?: string;
  academicYearId?: string;
  gradeId?: string;
  classId?: string;
  status?: string;
};

function readNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpsError("invalid-argument", `${fieldName} is required.`);
  }

  return value.trim();
}

function readOptionalBoolean(value: unknown) {
  return value === true;
}

function readString(data: FirebaseFirestore.DocumentData | undefined, key: string) {
  const value = data?.[key];

  return typeof value === "string" ? value.trim() : "";
}

function readStringList(data: Record<string, unknown> | undefined, key: string) {
  const value = data?.[key];

  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getPositiveNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

function isRegistrationOpen(activity: ActivityRow, now: number) {
  const opensAt = getPositiveNumber(activity.registrationOpensAt);
  const closesAt = getPositiveNumber(activity.registrationClosesAt);

  if (opensAt && opensAt > now) return false;
  if (closesAt && closesAt < now) return false;

  return true;
}

function assertStudentTargeted(params: {
  activity: ActivityRow;
  enrollment: StudentEnrollmentRow;
  studentId: string;
}) {
  const { activity, enrollment, studentId } = params;
  const audience = activity.targetAudience ?? {};

  const schoolIds = readStringList(audience, "schoolIds");
  const gradeIds = readStringList(audience, "gradeIds");
  const classIds = readStringList(audience, "classIds");
  const studentIds = readStringList(audience, "studentIds");

  if (activity.schoolId && enrollment.schoolId !== activity.schoolId) {
    throw new HttpsError(
      "failed-precondition",
      "Student is not in this activity school.",
    );
  }

  if (
    activity.academicYearId &&
    enrollment.academicYearId !== activity.academicYearId
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Student is not in this activity academic year.",
    );
  }

  if (schoolIds.length > 0 && !schoolIds.includes(enrollment.schoolId ?? "")) {
    throw new HttpsError(
      "failed-precondition",
      "Student is not targeted by this activity.",
    );
  }

  if (gradeIds.length > 0 && !gradeIds.includes(enrollment.gradeId ?? "")) {
    throw new HttpsError(
      "failed-precondition",
      "Student grade is not targeted by this activity.",
    );
  }

  if (classIds.length > 0 && !classIds.includes(enrollment.classId ?? "")) {
    throw new HttpsError(
      "failed-precondition",
      "Student class is not targeted by this activity.",
    );
  }

  if (studentIds.length > 0 && !studentIds.includes(studentId)) {
    throw new HttpsError(
      "failed-precondition",
      "Student is not targeted by this activity.",
    );
  }
}

async function loadGuardianIdForUid(params: { orgId: string; uid: string }) {
  const db = getFirestore();

  const userSnap = await db.doc(`users/${params.uid}`).get();
  const userData = userSnap.data();

  const personId = readString(userData, "personId");

  if (!personId) {
    throw new HttpsError(
      "permission-denied",
      "Guardian account is not linked to a person record.",
    );
  }

  const guardiansSnap = await db
    .collection(`orgs/${params.orgId}/guardians`)
    .where("personId", "==", personId)
    .limit(5)
    .get();

  for (const docSnap of guardiansSnap.docs) {
    const data = docSnap.data();

    if (data.isArchived === true) continue;

    return readString(data, "id") || docSnap.id;
  }

  throw new HttpsError(
    "permission-denied",
    "Guardian record was not found.",
  );
}

async function assertGuardianCanRegisterStudent(params: {
  orgId: string;
  guardianId: string;
  studentId: string;
}) {
  const db = getFirestore();

  const linksSnap = await db
    .collection(`orgs/${params.orgId}/guardianLinks`)
    .where("guardianId", "==", params.guardianId)
    .get();

  const hasActiveLink = linksSnap.docs.some((docSnap) => {
    const data = docSnap.data();

    return (
      data.active !== false &&
      readString(data, "studentId") === params.studentId
    );
  });

  if (!hasActiveLink) {
    throw new HttpsError(
      "permission-denied",
      "Guardian is not linked to this student.",
    );
  }
}

async function loadActiveEnrollment(params: {
  orgId: string;
  studentId: string;
}) {
  const db = getFirestore();

  const snap = await db
    .collection(`orgs/${params.orgId}/studentEnrollments`)
    .where("studentId", "==", params.studentId)
    .get();

  for (const docSnap of snap.docs) {
    const row = {
      id: docSnap.id,
      ...(docSnap.data() as Omit<StudentEnrollmentRow, "id">),
    };

    if (row.status === "ACTIVE") {
      return row;
    }
  }

  throw new HttpsError(
    "failed-precondition",
    "Student does not have an active enrollment.",
  );
}

export const registerStudentInActivity = onCall(
  {
    region: REGION,
  },
  async (request) => {
    const uid = request.auth?.uid;

    if (!uid) {
      throw new HttpsError(
        "unauthenticated",
        "You must be signed in to register in an activity.",
      );
    }

    const input = request.data as RegisterStudentInActivityInput;

    const orgId = readNonEmptyString(input.orgId, "orgId");
    const activityId = readNonEmptyString(input.activityId, "activityId");
    const studentId = readNonEmptyString(input.studentId, "studentId");
    const guardianConsentAccepted = readOptionalBoolean(
      input.guardianConsentAccepted,
    );

    const db = getFirestore();

    const guardianId = await loadGuardianIdForUid({ orgId, uid });

    await assertGuardianCanRegisterStudent({
      orgId,
      guardianId,
      studentId,
    });

    const enrollment = await loadActiveEnrollment({
      orgId,
      studentId,
    });

    const now = Date.now();

    const activityRef = db.doc(`orgs/${orgId}/schoolActivities/${activityId}`);
    const registrationId = `${activityId}_${studentId}`;
    const registrationRef = db.doc(
      `orgs/${orgId}/schoolActivityRegistrations/${registrationId}`,
    );

    return db.runTransaction(async (transaction) => {
      const activitySnap = await transaction.get(activityRef);

      if (!activitySnap.exists) {
        throw new HttpsError("not-found", "Activity was not found.");
      }

      const activity = {
        id: activitySnap.id,
        ...(activitySnap.data() as ActivityRow),
      };

      if (activity.orgId && activity.orgId !== orgId) {
        throw new HttpsError("permission-denied", "Activity org mismatch.");
      }

      if (activity.status !== "REGISTRATION_OPEN") {
        throw new HttpsError(
          "failed-precondition",
          "Activity registration is not open.",
        );
      }

      if (!isRegistrationOpen(activity, now)) {
        throw new HttpsError(
          "failed-precondition",
          "Activity registration window is closed.",
        );
      }

      if (activity.requiresGuardianConsent && !guardianConsentAccepted) {
        throw new HttpsError(
          "failed-precondition",
          "Guardian consent is required.",
        );
      }

      assertStudentTargeted({
        activity,
        enrollment,
        studentId,
      });

      const registrationSnap = await transaction.get(registrationRef);

      if (registrationSnap.exists) {
        const existing = registrationSnap.data();

        if (existing?.status !== "CANCELLED") {
          return {
            ok: true,
            alreadyRegistered: true,
            registrationId,
            status: existing?.status ?? "CONFIRMED",
          };
        }
      }

      const capacity = getPositiveNumber(activity.capacity);
      const registeredCount =
        typeof activity.registeredCount === "number"
          ? activity.registeredCount
          : 0;

      const hasAvailableSeat =
        capacity === undefined || registeredCount < capacity;

      const allowWaitlist = activity.allowWaitlist !== false;

      if (!hasAvailableSeat && !allowWaitlist) {
        throw new HttpsError(
          "resource-exhausted",
          "Activity capacity is full.",
        );
      }

      const registrationStatus = hasAvailableSeat
        ? "CONFIRMED"
        : "WAITLISTED";

      transaction.set(registrationRef, {
        id: registrationId,
        orgId,
        activityId,

        schoolId: activity.schoolId ?? enrollment.schoolId ?? "",
        academicYearId:
          activity.academicYearId ?? enrollment.academicYearId ?? "",

        studentId,
        guardianId,
        guardianUid: uid,

        status: registrationStatus,

        guardianConsentAccepted,
        guardianConsentText: activity.requiresGuardianConsent
          ? activity.consentText ?? ""
          : "",

        registeredAt: now,

        source: "PARENT_APP",

        answers: [],

        createdAt: now,
        updatedAt: now,

        metadata: {
          activityTitle: activity.title ?? "",
          enrollmentId: enrollment.id,
          schoolId: enrollment.schoolId ?? "",
          gradeId: enrollment.gradeId ?? "",
          classId: enrollment.classId ?? "",
        },
      });

      transaction.update(activityRef, {
        registeredCount: FieldValue.increment(hasAvailableSeat ? 1 : 0),
        confirmedCount: FieldValue.increment(hasAvailableSeat ? 1 : 0),
        waitlistedCount: FieldValue.increment(hasAvailableSeat ? 0 : 1),
        updatedAt: now,
      });

      return {
        ok: true,
        alreadyRegistered: false,
        registrationId,
        status: registrationStatus,
      };
    });
  },
);