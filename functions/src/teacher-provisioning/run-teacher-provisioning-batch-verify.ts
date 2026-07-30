import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  getFirestore,
  type DocumentReference,
  type DocumentSnapshot,
} from "firebase-admin/firestore";

import {
  TeacherProvisioningBatchInputSchema,
} from "@takween/contracts";

import { initializeStaffProvisioningAdmin } from "../staff-provisioning/initialize-staff-provisioning-admin";
import { mapTeacherPlanToFirestore } from "./map-teacher-plan-to-firestore";
import { previewTeacherProvisioning } from "./preview-teacher-provisioning";

async function readSnapshots(
  references: DocumentReference[],
): Promise<DocumentSnapshot[]> {
  if (references.length === 0) {
    return [];
  }

  return getFirestore().getAll(...references);
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is string =>
      typeof item === "string",
  );
}

function sameStringSet(
  actual: unknown,
  expected: string[],
) {
  const actualValues = [
    ...new Set(normalizeStringArray(actual)),
  ].sort();

  const expectedValues = [
    ...new Set(expected),
  ].sort();

  return (
    JSON.stringify(actualValues) ===
    JSON.stringify(expectedValues)
  );
}

async function main() {
  initializeStaffProvisioningAdmin();

  const inputPath = resolve(
    process.cwd(),
    "teacher-provisioning-batch-input.local.json",
  );

  const batchInput =
    TeacherProvisioningBatchInputSchema.parse(
      JSON.parse(readFileSync(inputPath, "utf8")),
    );

  const db = getFirestore();

  const results: Array<Record<string, unknown>> = [];
  let failed = 0;

  for (const teacher of batchInput.teachers) {
    const issues: string[] = [];

    try {
      const preview =
        await previewTeacherProvisioning({
          orgId: batchInput.orgId,
          schoolId: batchInput.schoolId,
          teacher,
        });

      const uid = preview.identity.uid;
      const personId = preview.plan.personId;

      if (!uid) {
        throw new Error(
          "لا يوجد Firebase Auth uid للمعلم",
        );
      }

      const firestorePlan =
        mapTeacherPlanToFirestore(preview.plan);

      const userRef = db.doc(`users/${uid}`);

      const personRef = db.doc(
        `orgs/${batchInput.orgId}/people/${personId}`,
      );

      const membershipRef = db.doc(
        `users/${uid}/orgMemberships/${batchInput.orgId}`,
      );

      const teacherAssignmentCollection =
        db.collection(
          `orgs/${batchInput.orgId}/teacherAssignments`,
        );

      const classLinkCollection =
        db.collection(
          `orgs/${batchInput.orgId}/teacherAssignmentClassLinks`,
        );

      const operationalAssignmentCollection =
        db.collection(
          `orgs/${batchInput.orgId}/operationalAssignments`,
        );

      const teacherAssignmentRefs =
        firestorePlan.teacherAssignments.map(
          (assignment) =>
            teacherAssignmentCollection.doc(
              assignment.id,
            ),
        );

      const classLinkRefs =
        firestorePlan.classLinks.map((link) =>
          classLinkCollection.doc(link.id),
        );

      const operationalAssignmentRefs =
        firestorePlan.operationalAssignments.map(
          (assignment) =>
            operationalAssignmentCollection.doc(
              assignment.id,
            ),
        );

      const legacyAssignmentRefs =
        teacher.legacyTeacherAssignmentIdsToEnd.map(
          (assignmentId) =>
            teacherAssignmentCollection.doc(
              assignmentId,
            ),
        );

      const [
        userSnapshot,
        personSnapshot,
        membershipSnapshot,
        teacherAssignmentSnapshots,
        classLinkSnapshots,
        operationalAssignmentSnapshots,
        legacyAssignmentSnapshots,
        activeActorOperationsSnapshot,
        guardianSnapshot,
      ] = await Promise.all([
        userRef.get(),

        personRef.get(),

        membershipRef.get(),

        readSnapshots(teacherAssignmentRefs),

        readSnapshots(classLinkRefs),

        readSnapshots(
          operationalAssignmentRefs,
        ),

        readSnapshots(legacyAssignmentRefs),

        operationalAssignmentCollection
          .where(
            "actorPersonId",
            "==",
            personId,
          )
          .get(),

        db
          .collection(
            `orgs/${batchInput.orgId}/guardians`,
          )
          .where("personId", "==", personId)
          .get(),
      ]);

      if (!userSnapshot.exists) {
        issues.push(
          `وثيقة المستخدم غير موجودة: ${userRef.path}`,
        );
      } else {
        const user = userSnapshot.data();

        if (user?.personId !== personId) {
          issues.push(
            "user.personId لا يطابق personId المتوقع",
          );
        }

        if (user?.email !== teacher.email) {
          issues.push(
            "البريد داخل وثيقة المستخدم غير صحيح",
          );
        }

        if (user?.isDisabled === true) {
          issues.push(
            "وثيقة المستخدم ما زالت معطلة",
          );
        }
      }

      if (!personSnapshot.exists) {
        issues.push(
          `وثيقة الشخص غير موجودة: ${personRef.path}`,
        );
      } else {
        const person = personSnapshot.data();

        if (person?.email !== teacher.email) {
          issues.push(
            "البريد داخل وثيقة الشخص غير صحيح",
          );
        }

        if (
          person?.displayName !==
          teacher.displayName
        ) {
          issues.push(
            "اسم الشخص لا يطابق ملف Batch",
          );
        }
      }

      if (!membershipSnapshot.exists) {
        issues.push(
          `العضوية غير موجودة: ${membershipRef.path}`,
        );
      } else {
        const membership =
          membershipSnapshot.data();

        if (
          membership?.roleKey !==
          teacher.roleKey
        ) {
          issues.push(
            `roleKey الحالي غير صحيح: ${String(
              membership?.roleKey,
            )}`,
          );
        }

        if (
          membership?.personId !== personId
        ) {
          issues.push(
            "membership.personId غير صحيح",
          );
        }

        if (
          membership?.isActive !== true
        ) {
          issues.push(
            "عضوية المعلم ليست نشطة",
          );
        }

        const scopes =
          membership?.scopes ?? {};

        if (
          !sameStringSet(
            scopes.schoolIds,
            preview.plan.membership.schoolIds,
          )
        ) {
          issues.push(
            "نطاق المدارس في العضوية غير صحيح",
          );
        }

        if (
          !sameStringSet(
            scopes.gradeIds,
            preview.plan.membership.gradeIds,
          )
        ) {
          issues.push(
            "نطاق الصفوف في العضوية غير صحيح",
          );
        }

        if (
          !sameStringSet(
            scopes.classIds,
            preview.plan.membership.classIds,
          )
        ) {
          issues.push(
            "نطاق الفصول في العضوية غير صحيح",
          );
        }

        if (
          !sameStringSet(
            scopes.subjectKeys,
            preview.plan.membership.subjectKeys,
          )
        ) {
          issues.push(
            "نطاق المواد في العضوية غير صحيح",
          );
        }
      }

      teacherAssignmentSnapshots.forEach(
        (snapshot, index) => {
          const expected =
            firestorePlan.teacherAssignments[
              index
            ];

          if (!expected) {
            issues.push(
              "تعذر تحديد الإسناد المتوقع",
            );

            return;
          }

          if (!snapshot.exists) {
            issues.push(
              `إسناد المعلم غير موجود: ${expected.id}`,
            );

            return;
          }

          const actual = snapshot.data();

          if (actual?.status !== "ACTIVE") {
            issues.push(
              `إسناد المعلم غير نشط: ${expected.id}`,
            );
          }

          if (
            actual?.teacherPersonId !==
            personId
          ) {
            issues.push(
              `teacherPersonId غير صحيح: ${expected.id}`,
            );
          }

          if (
            actual?.classSubjectOfferingId !==
            expected.classSubjectOfferingId
          ) {
            issues.push(
              `classSubjectOfferingId غير صحيح: ${expected.id}`,
            );
          }

          if (
            actual?.subjectKey !==
            expected.subjectKey
          ) {
            issues.push(
              `subjectKey غير صحيح: ${expected.id}`,
            );
          }

          if (
            actual?.isHomeroom !==
            expected.isHomeroom
          ) {
            issues.push(
              `isHomeroom غير صحيح: ${expected.id}`,
            );
          }
        },
      );

      classLinkSnapshots.forEach(
        (snapshot, index) => {
          const expected =
            firestorePlan.classLinks[index];

          if (!expected) {
            issues.push(
              "تعذر تحديد رابط الفصل المتوقع",
            );

            return;
          }

          if (!snapshot.exists) {
            issues.push(
              `رابط الفصل غير موجود: ${expected.id}`,
            );

            return;
          }

          const actual = snapshot.data();

          if (
            actual?.assignmentId !==
            expected.assignmentId
          ) {
            issues.push(
              `assignmentId غير صحيح في الرابط: ${expected.id}`,
            );
          }

          if (
            actual?.classId !==
            expected.classId
          ) {
            issues.push(
              `classId غير صحيح في الرابط: ${expected.id}`,
            );
          }

          if (
            actual?.classSubjectOfferingId !==
            expected.classSubjectOfferingId
          ) {
            issues.push(
              `classSubjectOfferingId غير صحيح في الرابط: ${expected.id}`,
            );
          }
        },
      );

      operationalAssignmentSnapshots.forEach(
        (snapshot, index) => {
          const expected =
            firestorePlan.operationalAssignments[
              index
            ];

          if (!expected) {
            issues.push(
              "تعذر تحديد الإسناد التشغيلي المتوقع",
            );

            return;
          }

          if (!snapshot.exists) {
            issues.push(
              `الإسناد التشغيلي غير موجود: ${expected.id}`,
            );

            return;
          }

          const actual = snapshot.data();

          if (
            actual?.status !== "ACTIVE" ||
            actual?.isActive !== true
          ) {
            issues.push(
              `الإسناد التشغيلي غير نشط: ${expected.id}`,
            );
          }

          if (
            actual?.operationKind !==
            expected.operationKind
          ) {
            issues.push(
              `operationKind غير صحيح: ${expected.id}`,
            );
          }

          if (
            actual?.actorPersonId !== personId
          ) {
            issues.push(
              `actorPersonId غير صحيح: ${expected.id}`,
            );
          }

          if (
            actual?.classSubjectOfferingId !==
            expected.classSubjectOfferingId
          ) {
            issues.push(
              `classSubjectOfferingId غير صحيح في العملية: ${expected.id}`,
            );
          }
        },
      );

      legacyAssignmentSnapshots.forEach(
        (snapshot, index) => {
          const assignmentId =
            teacher.legacyTeacherAssignmentIdsToEnd[
              index
            ];

          if (!assignmentId) {
            issues.push(
              "تعذر تحديد معرف الإسناد القديم",
            );

            return;
          }

          if (!snapshot.exists) {
            issues.push(
              `الإسناد القديم غير موجود: ${assignmentId}`,
            );

            return;
          }

          const actual = snapshot.data();

          if (actual?.status !== "ENDED") {
            issues.push(
              `الإسناد القديم لم ينتهِ: ${assignmentId}`,
            );
          }

          if (
            typeof actual?.endAt !== "number"
          ) {
            issues.push(
              `الإسناد القديم لا يحتوي endAt: ${assignmentId}`,
            );
          }
        },
      );

      const forbiddenAttendanceOperations =
        activeActorOperationsSnapshot.docs
          .filter((document) => {
            const data = document.data();

            return (
              data.operationKind ===
                "STUDENT_ATTENDANCE" &&
              data.status === "ACTIVE" &&
              data.isActive !== false
            );
          })
          .map((document) => document.id);

      if (
        forbiddenAttendanceOperations.length > 0
      ) {
        issues.push(
          `تم العثور على STUDENT_ATTENDANCE نشط: ${forbiddenAttendanceOperations.join(
            ", ",
          )}`,
        );
      }

      const guardianIds =
        guardianSnapshot.docs.map(
          (document) => document.id,
        );

      const status =
        issues.length === 0
          ? "VERIFIED"
          : "FAILED";

      if (status === "FAILED") {
        failed += 1;
      }

      results.push({
        teacher: {
          displayName: teacher.displayName,
          email: teacher.email,
          uid,
          personId,
        },

        status,

        counts: {
          teacherAssignments:
            teacherAssignmentSnapshots.filter(
              (snapshot) => snapshot.exists,
            ).length,

          classLinks:
            classLinkSnapshots.filter(
              (snapshot) => snapshot.exists,
            ).length,

          operationalAssignments:
            operationalAssignmentSnapshots.filter(
              (snapshot) => snapshot.exists,
            ).length,

          endedLegacyAssignments:
            legacyAssignmentSnapshots.filter(
              (snapshot) =>
                snapshot.data()?.status ===
                "ENDED",
            ).length,

          guardianRecords:
            guardianIds.length,
        },

        forbiddenStudentAttendance:
          forbiddenAttendanceOperations,

        guardianContext: {
          preserved: true,
          guardianIds,
        },

        issues,
      });
    } catch (error) {
      failed += 1;

      results.push({
        teacher: {
          displayName: teacher.displayName,
          email: teacher.email,
        },

        status: "ERROR",

        error:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  }

  console.log(
    JSON.stringify(
      {
        mode:
          "TEACHER_PROVISIONING_VERIFY_READ_ONLY",

        summary: {
          total: results.length,
          verified:
            results.length - failed,
          failed,
        },

        results,
      },
      null,
      2,
    ),
  );

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});