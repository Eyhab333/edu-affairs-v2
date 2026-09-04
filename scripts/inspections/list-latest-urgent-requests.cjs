const admin = require("firebase-admin");
const fs = require("node:fs");
const path = require("node:path");

function init() {
  if (admin.apps.length > 0) return;

  const serviceAccountPath =
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    path.resolve(process.cwd(), "scripts/service-account.json");

  if (fs.existsSync(serviceAccountPath)) {
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id,
    });
    return;
  }

  admin.initializeApp({ projectId: "edu-affairs-dev" });
}

async function main() {
  init();

  const db = admin.firestore();

  const snapshot = await db
    .collection("orgs/takween/urgentCommunicationRequests")
    .orderBy("createdAt", "desc")
    .limit(10)
    .get();

  if (snapshot.empty) {
    console.log("No urgent requests found.");
    return;
  }

  snapshot.docs.forEach((doc) => {
    const data = doc.data();

    console.log("\n==============================");
    console.log("id:", doc.id);
    console.log("createdAt:", data.createdAt);
    console.log("updatedAt:", data.updatedAt);
    console.log("schoolId:", data.schoolId);
    console.log("studentId:", data.studentId);
    console.log("threadId:", data.threadId);
    console.log("status:", data.status);
    console.log("currentLevel:", data.currentLevel);
    console.log("temporalStartStatus:", data.temporalStartStatus);
    console.log("temporalWorkflowId:", data.temporalWorkflowId);
    console.log("currentAssignee:", data.currentAssignee);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});