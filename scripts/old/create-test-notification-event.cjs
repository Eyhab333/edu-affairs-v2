const admin = require("firebase-admin");

admin.initializeApp({
  projectId: "edu-affairs-dev",
});

const db = admin.firestore();

async function main() {
  const orgId = "takween";
  const now = Date.now();

  const eventRef = db.collection(`orgs/${orgId}/notificationEvents`).doc();

  await eventRef.set({
    id: eventRef.id,
    orgId,

    schoolId: "mrb-boys-sayh",
    academicYearId: "ay-1448",
    termId: "term-1",
    termTitle: "الفصل الدراسي الأول",
    termShortTitle: "ف1",

    type: "CUSTOM",

    sourceType: "MANUAL",
    sourceId: `manual-test-${now}`,
    sourcePath: "",

    actorUid: "test-user",
    actorPersonId: "test-person",

    targetPersonId: "test-person",

    payload: {
      smokeTest: true,
      createdFrom: "create-test-notification-event.cjs",
    },

    status: "PENDING",

    createdAt: now,
    updatedAt: now,
  });

  console.log("Created NotificationEvent:");
  console.log(eventRef.path);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });