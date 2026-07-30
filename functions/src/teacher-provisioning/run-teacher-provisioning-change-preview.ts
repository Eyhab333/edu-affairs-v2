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

type UpsertAction =
  | "CREATE"
  | "UPDATE"
  | "REACTIVATE";

async function readSnapshots(
  references: DocumentReference[],
): Promise<DocumentSnapshot[]> {
  if (references.length === 0) {
    return [];
  }

  return getFirestore().getAll(...references);
}

function resolveUpsertAction(
  snapshot: DocumentSnapshot,
): UpsertAction {
  if (!snapshot.exists) {
    return "CREATE";
  }

  const data = snapshot.data();

  if (
    data?.status === "ENDED" ||
    data?.status === "INACTIVE" ||
    data?.isActive === false
  ) {
    return "REACTIVATE";
  }

  return "UPDATE";
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
  let errors = 0;

  for (const teacher of batchInput.teachers) {
    try {
      const preview =
        await previewTeacherProvisioning({
          orgId: batchInput.orgId,
          schoolId: batchInput.schoolId,
          teacher,
        });

      if (!preview.identity.uid) {
        throw new Error(
          "Change Preview الحالي يتطلب حساب Auth موجودًا",
        );
      }

      const firestorePlan =
        mapTeacherPlanToFirestore(preview.plan);

      const membershipRef = db.doc(
        `users/${preview.identity.uid}/orgMemberships/${batchInput.orgId}`,
      );

      const teacherAssignmentCollection = db.collection(
        `orgs/${batchInput.orgId}/teacherAssignments`,
      );

      const classLinkCollection = db.collection(
        `orgs/${batchInput.orgId}/teacherAssignmentClassLinks`,
      );

      const operationalAssignmentCollection = db.collection(
        `orgs/${batchInput.orgId}/operationalAssignments`,
      );

      const teacherAssignmentRefs =
        firestorePlan.teacherAssignments.map(
          (assignment) =>
            teacherAssignmentCollection.doc(assignment.id),
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
        membershipSnapshot,
        teacherAssignmentSnapshots,
        classLinkSnapshots,
        operationalAssignmentSnapshots,
        legacyAssignmentSnapshots,
      ] = await Promise.all([
        membershipRef.get(),

        readSnapshots(teacherAssignmentRefs),

        readSnapshots(classLinkRefs),

        readSnapshots(
          operationalAssignmentRefs,
        ),

        readSnapshots(legacyAssignmentRefs),
      ]);

      const desiredTeacherAssignmentIds = new Set(
        firestorePlan.teacherAssignments.map(
          (assignment) => assignment.id,
        ),
      );

      const legacyActions =
        legacyAssignmentSnapshots.map(
          (snapshot, index) => {
            const assignmentId =
              teacher.legacyTeacherAssignmentIdsToEnd[
                index
              ];

            if (!snapshot.exists) {
              throw new Error(
                `الإسناد القديم غير موجود: ${assignmentId}`,
              );
            }

            if (
              desiredTeacherAssignmentIds.has(
                assignmentId,
              )
            ) {
              throw new Error(
                `لا يمكن إنشاء وإنهاء نفس الإسناد: ${assignmentId}`,
              );
            }

            const data = snapshot.data();

            if (
              data?.teacherPersonId !==
              preview.plan.personId
            ) {
              throw new Error(
                `الإسناد القديم ${assignmentId} لا يخص المعلم ${preview.plan.personId}`,
              );
            }

            if (
              data?.schoolId !==
              batchInput.schoolId
            ) {
              throw new Error(
                `الإسناد القديم ${assignmentId} لا يتبع المدرسة ${batchInput.schoolId}`,
              );
            }

            return {
              id: assignmentId,
              path: snapshot.ref.path,

              action:
                data?.status === "ENDED"
                  ? "ALREADY_ENDED"
                  : "END",

              current: {
                assignmentKind:
                  data?.assignmentKind ?? null,

                subjectKey:
                  data?.subjectKey ?? null,

                classId:
                  data?.targetScopeId ??
                  data?.classId ??
                  null,

                isHomeroom:
                  data?.isHomeroom ?? false,

                status:
                  data?.status ?? null,
              },
            };
          },
        );

      results.push({
        teacher: {
          displayName: teacher.displayName,
          email: teacher.email,
          uid: preview.identity.uid,
          personId: preview.plan.personId,
        },

        mode: "CHANGE_PREVIEW_ONLY_NO_WRITES",

        membership: {
          path: membershipRef.path,
          action: membershipSnapshot.exists
            ? "UPDATE"
            : "CREATE",

          desiredRoleKey:
            preview.plan.membership.roleKey,

          desiredScopes: {
            schoolIds:
              preview.plan.membership.schoolIds,

            gradeIds:
              preview.plan.membership.gradeIds,

            classIds:
              preview.plan.membership.classIds,

            subjectKeys:
              preview.plan.membership.subjectKeys,
          },
        },

        teacherAssignments:
          firestorePlan.teacherAssignments.map(
            (assignment, index) => ({
              id: assignment.id,
              action: resolveUpsertAction(
                teacherAssignmentSnapshots[index],
              ),
              assignmentKind:
                assignment.assignmentKind,
              classId:
                assignment.targetScopeId,
              subjectKey:
                assignment.subjectKey,
              classSubjectOfferingId:
                assignment.classSubjectOfferingId,
            }),
          ),

        classLinks:
          firestorePlan.classLinks.map(
            (link, index) => ({
              id: link.id,
              action: resolveUpsertAction(
                classLinkSnapshots[index],
              ),
              assignmentId:
                link.assignmentId,
              classId: link.classId,
            }),
          ),

        operationalAssignments:
          firestorePlan.operationalAssignments.map(
            (assignment, index) => ({
              id: assignment.id,
              action: resolveUpsertAction(
                operationalAssignmentSnapshots[
                  index
                ],
              ),
              operationKind:
                assignment.operationKind,
              scopeType:
                assignment.scopeType,
              scopeId:
                assignment.scopeId,
            }),
          ),

        legacyTeacherAssignments:
          legacyActions,

        summary: {
          teacherAssignmentsToUpsert:
            firestorePlan.teacherAssignments.length,

          classLinksToUpsert:
            firestorePlan.classLinks.length,

          operationalAssignmentsToUpsert:
            firestorePlan.operationalAssignments.length,

          legacyAssignmentsToEnd:
            legacyActions.filter(
              (item) => item.action === "END",
            ).length,
        },
      });
    } catch (error) {
      errors += 1;

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
          "TEACHER_PROVISIONING_CHANGE_PREVIEW_NO_WRITES",

        summary: {
          total: results.length,
          succeeded: results.length - errors,
          errors,
        },

        results,
      },
      null,
      2,
    ),
  );

  if (errors > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});