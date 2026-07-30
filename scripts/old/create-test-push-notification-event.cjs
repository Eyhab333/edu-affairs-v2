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

  /**
   * ضع هنا uid الموجود في مستند deviceToken:
   * orgs/takween/deviceTokens/{uid}_mobile-parent_web
   */
  const targetUid = "f9xFKhh7YLQ1rJdERmbgz6tHQIk2";

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
    sourceId: `manual-push-test-${now}`,
    sourcePath: "",

    /**
     * مهم:
     * Resolver الحالي في CUSTOM يستخدم actorUid كمستلم USER.
     */
    actorUid: targetUid,
    actorPersonId: "",

    payload: {
      smokeTest: true,
      title: "اختبار إشعار",
      body: "تم إرسال إشعار تجريبي من Cloud Functions",
      createdFrom: "create-test-push-notification-event.cjs",
    },

    audienceKind: "DIRECT_RECIPIENTS",

    status: "PENDING",

    createdAt: now,
    updatedAt: now,
  });

  console.log("Created Push NotificationEvent:");
  console.log(eventRef.path);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });