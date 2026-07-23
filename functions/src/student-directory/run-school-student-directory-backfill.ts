import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";

import { backfillSchoolStudentDirectory } from "./backfill-school-student-directory";

const EXPECTED_PROJECT_ID = "edu-affairs-dev";

function initializeAdmin() {
  if (getApps().length > 0) return;

  const credentialsProjectId =
    process.env.GCLOUD_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    EXPECTED_PROJECT_ID;

  if (credentialsProjectId !== EXPECTED_PROJECT_ID) {
    throw new Error(
      `رفض التشغيل: المشروع الحالي ${credentialsProjectId} وليس ${EXPECTED_PROJECT_ID}`,
    );
  }

  initializeApp({
    credential: applicationDefault(),
    projectId: EXPECTED_PROJECT_ID,
  });
}

async function main() {
  initializeAdmin();

  const result = await backfillSchoolStudentDirectory({
    orgId: "takween",
    schoolId: "mrb-boys-sayh",
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});