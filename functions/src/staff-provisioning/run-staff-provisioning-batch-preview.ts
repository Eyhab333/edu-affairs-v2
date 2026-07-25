import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { getApps, initializeApp } from "firebase-admin/app";

import {
  StaffProvisioningBatchInputSchema,
  StaffProvisioningInputSchema,
} from "@takween/contracts";

import { previewStaffProvisioning } from "./preview-staff-provisioning";

const EXPECTED_PROJECT_ID = "edu-affairs-dev";

function verifyCredentialsProject() {
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (!credentialsPath) {
    throw new Error("GOOGLE_APPLICATION_CREDENTIALS غير محدد");
  }

  const credentials = JSON.parse(
    readFileSync(resolve(credentialsPath), "utf8"),
  ) as {
    project_id?: string;
  };

  if (credentials.project_id !== EXPECTED_PROJECT_ID) {
    throw new Error(
      `تم رفض التشغيل على ${
        credentials.project_id || "مشروع غير معروف"
      }؛ المسموح فقط ${EXPECTED_PROJECT_ID}`,
    );
  }
}

async function main() {
  verifyCredentialsProject();

  if (!getApps().length) {
    initializeApp({
      projectId: EXPECTED_PROJECT_ID,
    });
  }

  const inputPath = resolve(
    process.cwd(),
    "staff-provisioning-batch-input.local.json",
  );

  const batchInput = StaffProvisioningBatchInputSchema.parse(
    JSON.parse(readFileSync(inputPath, "utf8")),
  );

  const results: Array<Record<string, unknown>> = [];
  let errors = 0;

  for (const member of batchInput.staff) {
    const input = StaffProvisioningInputSchema.parse({
      ...member,

      orgId: batchInput.orgId,
      schoolId: batchInput.schoolId,
      principalPersonId: batchInput.principalPersonId,
    });

    try {
      const preview = await previewStaffProvisioning(input);

      results.push({
        displayName: input.displayName,
        email: input.email,
        roleKey: input.roleKey,

        status: preview.status,

        authAction: preview.pendingAuthCreation
          ? "CREATE"
          : "REUSE",

        personAction: preview.pendingPersonCreation
          ? "CREATE"
          : "REUSE",

        personId: preview.identity.personId || null,

        membership: preview.plan
          ? {
              scopeType: preview.plan.membership.scopeType,
              scopeId: preview.plan.membership.scopeId,
              principalPersonId:
                preview.plan.membership.principalPersonId,
            }
          : null,

        operations:
          preview.plan?.operationalAssignments.map(
            (assignment) => assignment.operationKind,
          ) ?? [],
      });
    } catch (error) {
      errors += 1;

      results.push({
        displayName: input.displayName,
        email: input.email,
        roleKey: input.roleKey,
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