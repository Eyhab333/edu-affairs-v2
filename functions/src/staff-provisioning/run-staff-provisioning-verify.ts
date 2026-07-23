import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { getApps, initializeApp } from "firebase-admin/app";

import { StaffProvisioningInputSchema } from "@takween/contracts";

import { verifyStaffProvisioning } from "./verify-staff-provisioning";

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
    "staff-provisioning-input.local.json",
  );

  const input = StaffProvisioningInputSchema.parse(
    JSON.parse(readFileSync(inputPath, "utf8")),
  );

  const result = await verifyStaffProvisioning(input);

  console.log(
    JSON.stringify(result, null, 2),
  );

  if (!result.passed) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});