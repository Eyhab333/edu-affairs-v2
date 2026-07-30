const admin = require("firebase-admin");
const path = require("path");

const serviceAccount = require(path.join(__dirname, "./service-account.json"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function main() {
  const orgId = "takween";
  const now = Date.now();

  const tokensSnap = await db
    .collection(`orgs/${orgId}/deviceTokens`)
    .where("app", "==", "web-staff")
    .where("isActive", "==", true)
    .limit(10)
    .get();

  if (tokensSnap.empty) {
    throw new Error("No active web-staff device token found.");
  }

  const tokenDoc = tokensSnap.docs[0];
  const tokenData = tokenDoc.data();

  const uid = readString(tokenData.uid);
  const personId = readString(tokenData.personId);
  const staffPersonId = readString(tokenData.staffPersonId) || personId;

  if (!uid && !personId && !staffPersonId) {
    throw new Error(
      `Device token ${tokenDoc.id} has no uid/personId/staffPersonId.`,
    );
  }

  const eventRef = db.collection(`orgs/${orgId}/notificationEvents`).doc();

  const eventData = {
    id: eventRef.id,
    orgId,

    schoolId: "mrb-boys-sayh",
    academicYearId: "ay-1448",
    termId: "term-1",
    termTitle: "الفصل الدراسي الأول",
    termShortTitle: "ف1",

    type: "CUSTOM",

    sourceType: "MANUAL",
    sourceId: `manual-web-staff-push-test-${now}`,
    sourcePath: "",

    actorUid: "",
    actorPersonId: "",

    targetStaffPersonId: staffPersonId,
    targetPersonId: staffPersonId ? "" : personId,

    payload: {
      smokeTest: true,
      app: "web-staff",
      tokenDocId: tokenDoc.id,
      createdFrom: "create-test-web-staff-push-event.cjs",
    },

    audienceKind: "DIRECT_RECIPIENTS",

    status: "PENDING",

    createdAt: now,
    updatedAt: now,
  };

  if (!staffPersonId && !personId && uid) {
    eventData.actorUid = uid;
  }

  await eventRef.set(eventData);

  console.log("Created web-staff Push NotificationEvent:");
  console.log(eventRef.path);
  console.log("Target token:", tokenDoc.id);
  console.log({
    uid,
    personId,
    staffPersonId,
  });
}

function readString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });