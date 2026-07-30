import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { TeacherProvisioningBatchInputSchema } from "@takween/contracts";

import { initializeStaffProvisioningAdmin } from "../staff-provisioning/initialize-staff-provisioning-admin";
import { previewTeacherProvisioning } from "./preview-teacher-provisioning";

async function main() {
  initializeStaffProvisioningAdmin();

  const inputPath = resolve(
    process.cwd(),
    "teacher-provisioning-batch-input.local.json",
  );

  const batchInput = TeacherProvisioningBatchInputSchema.parse(
    JSON.parse(readFileSync(inputPath, "utf8")),
  );

  const results: Array<Record<string, unknown>> = [];
  let errors = 0;

  for (const teacher of batchInput.teachers) {
    try {
      const preview = await previewTeacherProvisioning({
        orgId: batchInput.orgId,
        schoolId: batchInput.schoolId,
        teacher,
      });

      results.push({
        displayName: teacher.displayName,
        email: teacher.email,
        roleKey: teacher.roleKey,

        status: preview.status,

        authAction: preview.pendingAuthCreation
          ? "CREATE"
          : "REUSE",

        personAction: preview.pendingPersonCreation
          ? "CREATE"
          : "REUSE",

        personId: preview.identity.personId || null,
        personMatchSource:
          preview.identity.personMatchSource,

        membership: preview.plan.membership,

        teacherAssignments:
          preview.plan.teacherAssignments.map(
            (assignment) => ({
              id: assignment.id,
              classId: assignment.classId,
              subjectKey: assignment.subjectKey,
              classSubjectOfferingId:
                assignment.classSubjectOfferingId,
              operationKinds:
                assignment.operationKinds,
            }),
          ),

        operationalAssignments:
          preview.plan.operationalAssignments.map(
            (assignment) => ({
              id: assignment.id,
              operationKind:
                assignment.operationKind,
              scopeType: assignment.scopeType,
              scopeId: assignment.scopeId,
              classSubjectOfferingId:
                assignment.classSubjectOfferingId,
              routeId: assignment.routeId,
            }),
          ),

        additionalDuties:
          preview.plan.additionalDuties,
      });
    } catch (error) {
      errors += 1;

      results.push({
        displayName: teacher.displayName,
        email: teacher.email,
        roleKey: teacher.roleKey,
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