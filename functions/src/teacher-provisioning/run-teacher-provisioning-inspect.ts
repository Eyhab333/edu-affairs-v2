import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { getFirestore } from "firebase-admin/firestore";

import {
  OperationalAssignmentSchema,
  TeacherAssignmentClassLinkSchema,
  TeacherAssignmentSchema,
  TeacherProvisioningBatchInputSchema,
} from "@takween/contracts";

import { initializeStaffProvisioningAdmin } from "../staff-provisioning/initialize-staff-provisioning-admin";
import { previewTeacherProvisioning } from "./preview-teacher-provisioning";

type RuntimeSchema = {
  safeParse(input: unknown):
    | {
        success: true;
        data: unknown;
      }
    | {
        success: false;
        error: {
          issues: Array<{
            path: Array<string | number>;
            message: string;
          }>;
        };
      };
};

function inspectDocument(
  document: FirebaseFirestore.QueryDocumentSnapshot,
  schema: RuntimeSchema,
) {
  const rawData = {
    id: document.id,
    ...document.data(),
  };

  const parsed = schema.safeParse(rawData);

  return {
    id: document.id,
    path: document.ref.path,
    data: rawData,

    schemaValidation: parsed.success
      ? {
          valid: true,
        }
      : {
          valid: false,
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
  };
}

function uniqueDocuments(
  documents: FirebaseFirestore.QueryDocumentSnapshot[],
) {
  return Array.from(
    new Map(
      documents.map((document) => [
        document.ref.path,
        document,
      ]),
    ).values(),
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

  for (const teacher of batchInput.teachers) {
    const preview = await previewTeacherProvisioning({
      orgId: batchInput.orgId,
      schoolId: batchInput.schoolId,
      teacher,
    });

    const uid = preview.identity.uid;
    const personId = preview.identity.personId;

    if (!personId) {
      throw new Error(
        `لم نستطع تحديد personId للمعلم: ${teacher.email}`,
      );
    }

    const teacherAssignmentsCollection = db.collection(
      `orgs/${batchInput.orgId}/teacherAssignments`,
    );

    const [
      assignmentsByTeacherPerson,
      assignmentsByLegacyPerson,
      operationalAssignmentsSnapshot,
      guardianSnapshot,
    ] = await Promise.all([
      teacherAssignmentsCollection
        .where("teacherPersonId", "==", personId)
        .get(),

      teacherAssignmentsCollection
        .where("personId", "==", personId)
        .get(),

      db
        .collection(
          `orgs/${batchInput.orgId}/operationalAssignments`,
        )
        .where("actorPersonId", "==", personId)
        .get(),

      db
        .collection(`orgs/${batchInput.orgId}/guardians`)
        .where("personId", "==", personId)
        .get(),
    ]);

    const teacherAssignmentDocuments = uniqueDocuments([
      ...assignmentsByTeacherPerson.docs,
      ...assignmentsByLegacyPerson.docs,
    ]);

    const teacherAssignmentIds =
      teacherAssignmentDocuments.map(
        (document) => document.id,
      );

    const classLinkDocuments: FirebaseFirestore.QueryDocumentSnapshot[] =
      [];

    if (teacherAssignmentIds.length > 0) {
      const classLinksCollection = db.collection(
        `orgs/${batchInput.orgId}/teacherAssignmentClassLinks`,
      );

      const [linksByAssignmentId, linksByTeacherAssignmentId] =
        await Promise.all([
          classLinksCollection
            .where(
              "assignmentId",
              "in",
              teacherAssignmentIds.slice(0, 30),
            )
            .get(),

          classLinksCollection
            .where(
              "teacherAssignmentId",
              "in",
              teacherAssignmentIds.slice(0, 30),
            )
            .get(),
        ]);

      classLinkDocuments.push(
        ...linksByAssignmentId.docs,
        ...linksByTeacherAssignmentId.docs,
      );
    }

    const guardianLinks: Array<Record<string, unknown>> = [];

    for (const guardianDocument of guardianSnapshot.docs) {
      const linksSnapshot = await db
        .collection(`orgs/${batchInput.orgId}/guardianLinks`)
        .where("guardianId", "==", guardianDocument.id)
        .get();

      guardianLinks.push(
        ...linksSnapshot.docs.map((document) => ({
          id: document.id,
          path: document.ref.path,
          data: document.data(),
        })),
      );
    }

    const [
      userSnapshot,
      membershipSnapshot,
      personSnapshot,
    ] = await Promise.all([
      uid
        ? db.doc(`users/${uid}`).get()
        : Promise.resolve(null),

      uid
        ? db
            .doc(
              `users/${uid}/orgMemberships/${batchInput.orgId}`,
            )
            .get()
        : Promise.resolve(null),

      db
        .doc(
          `orgs/${batchInput.orgId}/people/${personId}`,
        )
        .get(),
    ]);

    const currentTeacherAssignments =
      teacherAssignmentDocuments.map((document) =>
        inspectDocument(
          document,
          TeacherAssignmentSchema,
        ),
      );

    const currentClassLinks = uniqueDocuments(
      classLinkDocuments,
    ).map((document) =>
      inspectDocument(
        document,
        TeacherAssignmentClassLinkSchema,
      ),
    );

    const currentOperationalAssignments =
      operationalAssignmentsSnapshot.docs.map((document) =>
        inspectDocument(
          document,
          OperationalAssignmentSchema,
        ),
      );

    const findings: string[] = [];

    for (const document of teacherAssignmentDocuments) {
      const data = document.data();

      if (
        data.isHomeroom === true &&
        !teacher.additionalDuties.some(
          (duty) =>
            duty.dutyKey === "HOMEROOM_TEACHER" &&
            duty.classId ===
              (data.targetScopeId ?? data.classId),
        )
      ) {
        findings.push(
          `الإسناد الحالي ${document.id} مسجل كرائد فصل، لكن ملف Batch لا يحتوي HOMEROOM_TEACHER له.`,
        );
      }

      if (
        typeof data.subjectKey === "string" &&
        data.subjectKey === "GENERAL"
      ) {
        findings.push(
          `الإسناد الحالي ${document.id} يستخدم subjectKey=GENERAL وليس مادة محددة.`,
        );
      }
    }

    for (const document of operationalAssignmentsSnapshot.docs) {
      if (
        document.data().operationKind ===
        "STUDENT_ATTENDANCE"
      ) {
        findings.push(
          `تحذير: يوجد إسناد حضور طلاب حالي للمعلم: ${document.id}`,
        );
      }
    }

    if (!guardianSnapshot.empty) {
      findings.push(
        "الشخص مرتبط أيضًا كسجل ولي أمر؛ يجب الحفاظ على guardians وguardianLinks دون تعديل.",
      );
    }

    results.push({
      teacher: {
        displayName: teacher.displayName,
        email: teacher.email,
        personId,
        uid: uid || null,
      },

      currentIdentity: {
        user: userSnapshot?.exists
          ? {
              path: userSnapshot.ref.path,
              data: userSnapshot.data(),
            }
          : null,

        person: personSnapshot.exists
          ? {
              path: personSnapshot.ref.path,
              data: personSnapshot.data(),
            }
          : null,

        membership: membershipSnapshot?.exists
          ? {
              path: membershipSnapshot.ref.path,
              data: membershipSnapshot.data(),
            }
          : null,
      },

      guardianContext: {
        guardians: guardianSnapshot.docs.map(
          (document) => ({
            id: document.id,
            path: document.ref.path,
            data: document.data(),
          }),
        ),
        guardianLinks,
      },

      current: {
        teacherAssignments:
          currentTeacherAssignments,

        classLinks:
          currentClassLinks,

        operationalAssignments:
          currentOperationalAssignments,
      },

      expectedFromBatch: {
        membership: preview.plan.membership,

        teacherAssignments:
          preview.plan.teacherAssignments,

        classLinks:
          preview.plan.classLinks,

        operationalAssignments:
          preview.plan.operationalAssignments,

        additionalDuties:
          preview.plan.additionalDuties,
      },

      findings,
    });
  }

  console.log(
    JSON.stringify(
      {
        mode: "INSPECT_ONLY_NO_WRITES",
        summary: {
          teachers: results.length,
        },
        results,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});