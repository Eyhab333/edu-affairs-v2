import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  TeacherProvisioningBatchInputSchema,
} from "@takween/contracts";

import { initializeStaffProvisioningAdmin } from "../staff-provisioning/initialize-staff-provisioning-admin";
import { mapTeacherPlanToFirestore } from "./map-teacher-plan-to-firestore";
import { previewTeacherProvisioning } from "./preview-teacher-provisioning";

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

      const firestorePlan =
        mapTeacherPlanToFirestore(preview.plan);

      results.push({
        teacher: {
          displayName: teacher.displayName,
          email: teacher.email,
          personId: preview.plan.personId,
          roleKey: teacher.roleKey,
        },

        mode: "PREVIEW_ONLY_NO_WRITES",

        legacyTeacherAssignmentIdsToEnd:
          teacher.legacyTeacherAssignmentIdsToEnd,

        documentsToWrite: {
          membership: preview.plan.membership,

          teacherAssignments:
            firestorePlan.teacherAssignments,

          classLinks:
            firestorePlan.classLinks,

          operationalAssignments:
            firestorePlan.operationalAssignments,
        },

        counts: {
          teacherAssignments:
            firestorePlan.teacherAssignments.length,

          classLinks:
            firestorePlan.classLinks.length,

          operationalAssignments:
            firestorePlan.operationalAssignments.length,

          legacyAssignmentsToEnd:
            teacher.legacyTeacherAssignmentIdsToEnd.length,
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
        mode: "FIRESTORE_PLAN_PREVIEW_ONLY_NO_WRITES",

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