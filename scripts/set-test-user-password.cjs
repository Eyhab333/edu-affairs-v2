/* eslint-disable no-console */

const admin = require("firebase-admin");
const path = require("path");

const EMAIL = (process.env.EMAIL || "a.brakat@qz.org.sa").toLowerCase();
const PASSWORD = process.env.PASSWORD || "Teacher@123456";

function initAdmin() {
  if (admin.apps.length) return;

  const serviceAccountPath = path.resolve(
    process.cwd(),
    "service-account.json"
  );

  const serviceAccount = require(serviceAccountPath);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });
}

async function main() {
  initAdmin();

  const user = await admin.auth().getUserByEmail(EMAIL);

  await admin.auth().updateUser(user.uid, {
    password: PASSWORD,
  });

  console.log("✅ Password updated successfully.");
  console.log({
    email: EMAIL,
    uid: user.uid,
    temporaryPassword: PASSWORD,
  });
}

main().catch((error) => {
  console.error("❌ Failed to update password:");
  console.error(error);
  process.exit(1);
});