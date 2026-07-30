import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  TeacherProvisioningBatchInputSchema,
} from "@takween/contracts";

import { initializeStaffProvisioningAdmin } from "../staff-provisioning/initialize-staff-provisioning-admin";
import { applyTeacherProvisioning } from "./apply-teacher-provisioning";

const REQUIRED_CONFIRMATION =
  "--confirm=APPLY_TEACHERS";

async function main() {
  if (!process.argv.includes(REQUIRED_CONFIRMATION)) {
    throw new Error(
      [
        "تم إيقاف Teacher Apply للحماية.",
        "شغّل الأمر مع التأكيد الصريح:",
        REQUIRED_CONFIRMATION,
      ].join(" "),
    );
  }

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
      const result =
        await applyTeacherProvisioning({
          orgId: batchInput.orgId,
          schoolId: batchInput.schoolId,
          teacher,
        });

      results.push({
        displayName: teacher.displayName,
        email: teacher.email,

        status: "APPLIED",

        uid: result.uid,
        personId: result.personId,

        authAction: result.authAction,

        initialPassword:
          result.initialPassword ?? null,

        membershipPath:
          result.membershipPath,

        teacherAssignmentIds:
          result.teacherAssignmentIds,

        classLinkIds:
          result.classLinkIds,

        operationalAssignmentIds:
          result.operationalAssignmentIds,

        endedLegacyTeacherAssignmentIds:
          result.endedLegacyTeacherAssignmentIds,

        alreadyEndedLegacyTeacherAssignmentIds:
          result.alreadyEndedLegacyTeacherAssignmentIds,
      });
    } catch (error) {
      errors += 1;

      results.push({
        displayName: teacher.displayName,
        email: teacher.email,

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
        mode: "TEACHER_PROVISIONING_APPLY",

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