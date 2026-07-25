import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { getApps, initializeApp } from "firebase-admin/app";

import {
  StaffProvisioningBatchInputSchema,
  StaffProvisioningInputSchema,
} from "@takween/contracts";

import { applyStaffProvisioning } from "./apply-staff-provisioning";

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

  console.log(`سيتم تجهيز ${batchInput.staff.length} موظفين...`);

  for (const member of batchInput.staff) {
    const input = StaffProvisioningInputSchema.parse({
      ...member,

      orgId: batchInput.orgId,
      schoolId: batchInput.schoolId,
      principalPersonId: batchInput.principalPersonId,
    });

    try {
      console.log(`تجهيز: ${input.displayName} · ${input.roleKey}`);

      const result = await applyStaffProvisioning(input);

      results.push({
        success: true,

        displayName: input.displayName,
        email: input.email,
        roleKey: input.roleKey,

        uid: result.uid,
        personId: result.personId,

        authAction: result.authAction,
        membershipPath: result.membershipPath,

        operationalAssignmentIds:
          result.operationalAssignmentIds,

        deactivatedAssignmentIds:
          result.deactivatedAssignmentIds,

        initialPassword: result.initialPassword ?? null,
      });
    } catch (error) {
      errors += 1;

      results.push({
        success: false,

        displayName: input.displayName,
        email: input.email,
        roleKey: input.roleKey,

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