import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { getApps, initializeApp } from "firebase-admin/app";

import { StaffProvisioningInputSchema } from "@takween/contracts";

import { previewStaffProvisioning } from "./preview-staff-provisioning";

const EXPECTED_PROJECT_ID = "edu-affairs-dev";

function verifyCredentialsProject() {
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (!credentialsPath) {
    throw new Error(
      "GOOGLE_APPLICATION_CREDENTIALS غير محدد",
    );
  }

  const credentials = JSON.parse(
    readFileSync(resolve(credentialsPath), "utf8"),
  ) as {
    project_id?: string;
  };

  if (credentials.project_id !== EXPECTED_PROJECT_ID) {
    throw new Error(
      `تم رفض التشغيل: ملف الخدمة يخص ${
        credentials.project_id || "مشروعًا غير معروف"
      } وليس ${EXPECTED_PROJECT_ID}`,
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
    "staff-provisioning-input.local.json",
  );

  const rawInput = JSON.parse(
    readFileSync(inputPath, "utf8"),
  );

  const input = StaffProvisioningInputSchema.parse(rawInput);

  const preview = await previewStaffProvisioning(input);

  console.log(
    JSON.stringify(
      {
        status: preview.status,

        identity: {
          authExists: preview.identity.authExists,
          personExists: preview.identity.personExists,
          personMatchSource:
            preview.identity.personMatchSource,
          uid: preview.identity.uid || null,
          personId: preview.identity.personId || null,
        },

        pendingAuthCreation:
          preview.pendingAuthCreation,

        pendingPersonCreation:
          preview.pendingPersonCreation,

        plannedMembership: preview.plan
          ? {
              roleKey: preview.plan.membership.roleKey,
              scopeType: preview.plan.membership.scopeType,
              scopeId: preview.plan.membership.scopeId,
              schoolIds:
                preview.plan.membership.scopes?.schoolIds,
            }
          : null,

        plannedOperations:
          preview.plan?.operationalAssignments.map(
            (assignment) => ({
              id: assignment.id,
              operationKind: assignment.operationKind,
              scopeId: assignment.scopeId,
            }),
          ) ?? [],
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