import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  cert,
  getApps,
  initializeApp,
  type ServiceAccount,
} from "firebase-admin/app";

const EXPECTED_PROJECT_ID = "edu-affairs-dev";

export function initializeStaffProvisioningAdmin() {
  const credentialsPath =
    process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim() ||
    resolve(process.cwd(), "../service-account.json");

  const credentials = JSON.parse(
    readFileSync(credentialsPath, "utf8"),
  ) as ServiceAccount & {
    project_id?: string;
  };

  if (credentials.project_id !== EXPECTED_PROJECT_ID) {
    throw new Error(
      `تم رفض التشغيل: ملف الخدمة يخص ${
        credentials.project_id || "مشروعًا غير معروف"
      } وليس ${EXPECTED_PROJECT_ID}`,
    );
  }

  if (!getApps().length) {
    initializeApp({
      credential: cert(credentials),
      projectId: EXPECTED_PROJECT_ID,
    });
  }
}