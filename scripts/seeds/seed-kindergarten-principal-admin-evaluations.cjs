/* eslint-disable no-console */

const admin = require("firebase-admin");
const path = require("path");

const APPLY = process.argv.includes("--apply");

const CONFIG = {
  orgId: "takween",
  academicYearId: "ay-1448",
  termId: "term-1",
  schools: [
    {
      id: "kg-01",
      label: "روضة واحة الرياحين الأولى",
      evaluator: {
        uid: "aTZHsoDfPBU6Ej5lMG1Ilcny3j73",
        personId: "p-a-alhomidi",
        displayName: "أشواق الحميدي الحميدي",
        email: "a.alhomidi@qz.org.sa",
      },
      targets: {
        vicePrincipal: target("ms10LdA0k5TVkiJo4VO6pprmcOh2", "staff-ms10LdA0k5TVkiJo4VO6pprmcOh2", "تماضر صالح محمد العامر", "t.alamer@qz.org.sa", "KG_VP", "الوكيلة", "وكيلة الروضة"),
        adminAssistant: target("RhSQbd6EprRCLSaXetCb180WnQo1", "p-a-alfarag", "امجاد عبدالله صالح الفرج", "a.alfarag@qz.org.sa", "ADMIN_ASSISTANT", "المساعدة الإدارية", "مساعدة إدارية"),
        media: target("nolrXXV5WBYGa6cW64Hu22IJRHa2", "p-ms-alswiket", "مريم سليمان محمد السويكت", "ms.alswiket@qz.org.sa", "MEDIA_SPECIALIST", "الإعلامية", "الإعلامية"),
        careResponsible: target("KVq4V9YDmNcwpLKLvXI9u4AsfJm2", "staff-KVq4V9YDmNcwpLKLvXI9u4AsfJm2", "سلمى عبدالرحمن احمد النداوي", "s.alnadawi@qz.org.sa", "NURSERY_CAREGIVER", "مسؤولة الرعاية", "مسؤولة رعاية"),
      },
    },
    {
      id: "kg-02",
      label: "روضة واحة الرياحين الثانية",
      evaluator: {
        uid: "jGr6C7kUcGOr1M8crXi1kFIiATr2",
        personId: "p-s-alturiqe",
        displayName: "سارة عبدالرحمن الطريقي",
        email: "s.alturiqe@qz.org.sa",
      },
      targets: {
        vicePrincipal: target("yC5MUiMlxCXt9RnrjPmT85Ko34t1", "p-h-aljower", "هاجر أحمد فهد الجوير", "h.aljower@qz.org.sa", "KG_VP", "الوكيلة", "وكيلة الروضة"),
        adminAssistant: target("WyWOM24TY4RrgP1D0Q0xDD9tx2U2", "p-aa-alnutifi", "أسماء عبدالله راشد النتيفي", "aa.alnutifi@qz.org.sa", "ADMIN_ASSISTANT", "المساعدة الإدارية", "مساعدة إدارية"),
        media: target("Beaw0vknvTRpOrtNKQKn1DMyGoQ2", "p-s-alosaimi", "شادن عبدالمحسن علي العصيمي", "s.alosaimi@qz.org.sa", "MEDIA_SPECIALIST", "الإعلامية", "الإعلامية"),
        careResponsible: target("PWuDk4Gw6uWgQvRD8Y40xuHMg1r1", "p-a-almutairi", "عائشه الحمدي محمد المطيري", "a.almutairi@qz.org.sa", "NURSERY_CAREGIVER", "مسؤولة الرعاية", "مسؤولة رعاية"),
        caregiver: target("4Ewpo24z5ahwSGfDW52xbykGqzk2", "p-h-almasood", "هيا عبد العزيز احمد المسعود", "h.almasood@qz.org.sa", "NURSERY_CAREGIVER", "الحاضنة", "حاضنة"),
      },
    },
    {
      id: "kg-03",
      label: "روضة واحة الرياحين الثالثة",
      evaluator: {
        uid: "v2v5vCne5VPgu8XPX2uZW2JpOjO2",
        personId: "p-s-alnafea",
        displayName: "سمية أحمد راشد النافع",
        email: "s.alnafea@qz.org.sa",
      },
      targets: {
        vicePrincipal: target("tfvc13fv0DOLqAjQ8s8cpojRMVG2", "p-s-alslman", "ساره سعد أحمد السلمان", "s.alslman@qz.org.sa", "KG_VP", "الوكيلة", "وكيلة الروضة"),
        adminAssistant: target("u6Xt5Yitqcbph9HXqEMqH9jXPJ42", "p-n-alshammri", "نوره ابراهيم فنيسان الشمري", "n.alshammri@qz.org.sa", "ADMIN_ASSISTANT", "المساعدة الإدارية", "مساعدة إدارية"),
        media: target("I8l7prITBjbkDzLoyAln7kmVRbl2", "p-f-alzuwaid", "فاطمة عبدالله صالح الزويد", "f.alzuwaid@qz.org.sa", "MEDIA_SPECIALIST", "الإعلامية", "الإعلامية"),
        careResponsible: target("x7vK7zcBuWM7358OpKywUM7GFb13", "staff-x7vK7zcBuWM7358OpKywUM7GFb13", "حاليه محمد يامي شحيذي", "sh.shuhidhi@qz.org.sa", "NURSERY_CAREGIVER", "مسؤولة الرعاية", "مسؤولة رعاية"),
        caregiver: target("UQZXJrO1G6QuaXNYvjbG04qturo1", "staff-UQZXJrO1G6QuaXNYvjbG04qturo1", "صيته فيحان علي العبيوي", "s.alobawe@qz.org.sa", "NURSERY_CAREGIVER", "الحاضنة", "حاضنة"),
      },
    },
    {
      id: "kg-04",
      label: "روضة واحة الرياحين الرابعة",
      evaluator: {
        uid: "uVQmM9JaIWWvMzLuaWZs4VDB7zD3",
        personId: "p-n-alhamiyn",
        displayName: "نورة علي عبدالعزيز الحمين",
        email: "n.alhamiyn@qz.org.sa",
      },
      targets: {
        vicePrincipal: target("2DtRW3PPQLSjuZR1Pyp1WucwzKy1", "p-h-alshaya", "حصه عبدالرزاق احمد الشايع", "h.alshaya@qz.org.sa", "KG_VP", "الوكيلة", "وكيلة الروضة"),
        adminAssistant: target("yGW1VIe5i7Oy7ybWCKOsbf5qm0l2", "p-mm-almousa", "مشاعل محمد شايع الموسى", "mm.almousa@qz.org.sa", "ADMIN_ASSISTANT", "المساعدة الإدارية", "مساعدة إدارية"),
        media: target("47YuQWNMDtb79j3Qha6PVa9J9zz1", "staff-47YuQWNMDtb79j3Qha6PVa9J9zz1", "لمى عبدالعزيز عثمان الطيار", "l.altayar@qz.org.sa", "MEDIA_SPECIALIST", "الإعلامية", "الإعلامية"),
        careResponsible: target("Z9fipz9d9mN8eCn7lsMSXkBN7Bl2", "staff-Z9fipz9d9mN8eCn7lsMSXkBN7Bl2", "نوير هلال سعدي الميموني", "n.almaimouni@qz.org.sa", "NURSERY_CAREGIVER", "مسؤولة الرعاية", "مسؤولة رعاية"),
        caregiver: target("JcjOsjtH5IO2JZtZiDGtPy7T0Vh1", "staff-JcjOsjtH5IO2JZtZiDGtPy7T0Vh1", "غزواء سليمان العتيبي", "ghzwa@qz.org.sa", "NURSERY_CAREGIVER", "الحاضنة", "حاضنة"),
      },
    },
  ],
};

function target(uid, personId, displayName, email, roleKey, roleLabel, membershipTitle) {
  return { uid, personId, displayName, email, roleKey, roleLabel, membershipTitle };
}

const ORDINALS = [
  "الأول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس", "السابع", "الثامن", "التاسع",
  "العاشر", "الحادي عشر", "الثاني عشر", "الثالث عشر", "الرابع عشر", "الخامس عشر",
  "السادس عشر", "السابع عشر", "الثامن عشر", "التاسع عشر",
];

function evaluationCycles(count) {
  return ORDINALS.slice(0, count).map((ordinal, index) => ({
    number: index + 1,
    title: `التقييم ${ordinal}`,
    suffix: `evaluation-${String(index + 1).padStart(2, "0")}`,
    kind: "CUSTOM",
  }));
}

function weeklyCycles() {
  return ORDINALS.map((ordinal, index) => ({
    number: index + 1,
    title: `الأسبوع ${ordinal}`,
    suffix: `week-${String(index + 1).padStart(2, "0")}`,
    kind: "WEEK",
  }));
}

const EVERY_TWO_WEEKS = evaluationCycles(9);
const THREE_TIMES = evaluationCycles(3);
const WEEKLY = weeklyCycles();

const FRAMEWORKS = [
  {
    key: "vice-principal-every-two-weeks",
    id: "kg-principal-vice-principal-every-two-weeks-evaluation-v1",
    title: "تقييم مديرة الروضة للوكيلة - المتابعة كل أسبوعين",
    targetSlot: "vicePrincipal",
    roleKey: "KG_VP",
    roleLabel: "الوكيلة",
    planKind: "PERIODIC",
    cycles: EVERY_TWO_WEEKS,
    items: [
      "متابعة تحضير الدروس للمعلمات",
      "متابعة رصد المعلمات بالدرايف (حروف، أرقام، قرآن)",
      "سجل الواجبات",
      "الكتاب المدرسي",
      "الإشراف على نظافة المرافق",
      "إعداد جداول الإشراف اليومي والمناوبة والإذاعة",
      "متابعة التزام المعلمات بدخول الحصص",
      "متابعة التزام المعلمات بدخول حصص الانتظار",
      "النشر الإعلامي للفعاليات وأخبار المدارس",
      "الالتزام بالزي الرسمي",
      "السلوك العام والقدوة الحسنة",
      "حسن التصرف مع الرؤساء والزملاء وأولياء الأمور",
      "الالتزام والإشراف على الأطفال والمناوبات",
      "القيام بما يسند إليها من مهام",
      "المبادرة بتقبل التوجيهات",
      "متابعة حضور وانصراف الأطفال مع النقل",
      "متابعة مشرفات النقل وسجلاتهن",
    ],
  },
  {
    key: "vice-principal-three-times",
    id: "kg-principal-vice-principal-three-times-evaluation-v1",
    title: "تقييم مديرة الروضة للوكيلة - المتابعة ثلاث مرات",
    targetSlot: "vicePrincipal",
    roleKey: "KG_VP",
    roleLabel: "الوكيلة",
    planKind: "PERIODIC",
    cycles: THREE_TIMES,
    items: [
      "تنفيذ الزيارات للمعلمات",
      "تنفيذ برامج الانضباط المدرسي",
      "متابعة مجتمعات التعلم المهنية",
      "متابعة الطلاب المتعثرين",
      "المساهمة في تدريب الزملاء تقنيًا",
      "الاهتمام بالتطوير المهني والنمو المعرفي",
      "تنفيذ خطة الفاقد التعليمي",
      "تنفيذ خطة الانضباط المدرسي",
      "الإشراف على الطابور الصباحي",
      "تفعيل المبادرات التعليمية",
    ],
  },
  {
    key: "admin-assistant-every-two-weeks",
    id: "kg-principal-admin-assistant-every-two-weeks-evaluation-v1",
    title: "تقييم مديرة الروضة للمساعدة الإدارية - المتابعة كل أسبوعين",
    targetSlot: "adminAssistant",
    roleKey: "ADMIN_ASSISTANT",
    roleLabel: "المساعدة الإدارية",
    planKind: "PERIODIC",
    cycles: EVERY_TWO_WEEKS,
    items: [
      "رصد حضور وغياب الأطفال",
      "الالتزام والإشراف على الأطفال والمناوبات",
      "الإرشاد الصحي",
      "الإشراف على الطابور الصباحي",
      "الإشراف على حركة الأطفال في الممرات والساحات",
      "المناوبة بالدور العلوي وقت الدوام",
      "متابعة الأطفال وقت الحضور والانصراف",
      "تسجيل خروج الأطفال أثناء الدوام",
      "تفعيل الأنشطة",
      "الإشراف على ترتيب وتنظيم الورشة",
      "الالتزام بالزي الرسمي",
      "المبادرة بتقبل التوجيهات",
      "حسن التصرف مع الرؤساء والزملاء وأولياء الأمور",
      "النشر الإعلامي للفعاليات وأخبار المدارس",
      "القيام بما يسند إليها من مهام",
    ],
  },
  {
    key: "admin-assistant-three-times",
    id: "kg-principal-admin-assistant-three-times-evaluation-v1",
    title: "تقييم مديرة الروضة للمساعدة الإدارية - المتابعة ثلاث مرات",
    targetSlot: "adminAssistant",
    roleKey: "ADMIN_ASSISTANT",
    roleLabel: "المساعدة الإدارية",
    planKind: "PERIODIC",
    cycles: THREE_TIMES,
    items: [
      "تنفيذ برامج الانضباط المدرسي",
      "تسليم واستلام العهد",
      "تنظيم وحفظ سجلات الإدارة",
      "المشاركة بتنظيم خروج الأطفال بالنقل",
      "كتابة الخطابات بدقة ومتابعة البريد",
      "متابعة المنصات (راصد، مدارس، نور)",
      "الإرشاد الصحي",
      "التطوير المهني والنمو المعرفي",
      "المساهمة في تدريب الزملاء تقنيًا",
      "تنفيذ المبادرات والأنشطة",
      "السلوك العام والقدوة الحسنة",
    ],
  },
  {
    key: "media-every-two-weeks",
    id: "kg-principal-media-every-two-weeks-evaluation-v1",
    title: "تقييم مديرة الروضة للإعلامية - المتابعة كل أسبوعين",
    targetSlot: "media",
    roleKey: "MEDIA_SPECIALIST",
    roleLabel: "الإعلامية",
    planKind: "PERIODIC",
    cycles: EVERY_TWO_WEEKS,
    items: [
      "الرد على اتصالات أولياء الأمور",
      "الرد على رسائل أولياء الأمور بشكل مناسب",
      "النشر الإعلامي للفعاليات وأخبار المدارس",
      "الالتزام والإشراف على الأطفال والمناوبات",
      "المناوبة بالدور العلوي وقت الدوام",
      "المبادرة والمشاركة وتفعيل الأنشطة المدرسية",
      "الالتزام بالزي الرسمي",
      "القيام بما يسند إليها من مهام",
      "المبادرة بتقبل التوجيهات",
      "حسن التصرف مع الرؤساء والزملاء وأولياء الأمور",
    ],
  },
  {
    key: "media-three-times",
    id: "kg-principal-media-three-times-evaluation-v1",
    title: "تقييم مديرة الروضة للإعلامية - المتابعة ثلاث مرات",
    targetSlot: "media",
    roleKey: "MEDIA_SPECIALIST",
    roleLabel: "الإعلامية",
    planKind: "PERIODIC",
    cycles: THREE_TIMES,
    items: [
      "تدريب الزملاء تقنيًا",
      "التطوير المهني والنمو المعرفي",
      "تنفيذ المبادرات",
      "الأمن والسلامة",
      "السلوك العام والقدوة الحسنة",
    ],
  },
  {
    key: "care-responsible-every-two-weeks",
    id: "kg-principal-care-responsible-every-two-weeks-evaluation-v1",
    title: "تقييم مديرة الروضة لمسؤولة الرعاية - المتابعة كل أسبوعين",
    targetSlot: "careResponsible",
    roleKey: "NURSERY_CAREGIVER",
    roleLabel: "مسؤولة الرعاية",
    planKind: "PERIODIC",
    cycles: EVERY_TWO_WEEKS,
    items: [
      "متابعة الأطفال في دورات المياه",
      "الإشراف على حركة الأطفال في الممرات والساحات",
      "توجيه الأطفال للسلوك الإيجابي",
      "متابعة التهوية والنظافة في دورات المياه",
      "تدريب الأطفال على الالتزام بقواعد السلامة",
      "الاهتمام بالنظافة العامة للأطفال",
      "حسن التصرف مع الرؤساء والزملاء وأولياء الأمور",
      "المبادرة بتقبل التوجيهات",
      "القيام بما يسند إليها من مهام",
      "السلوك العام والقدوة الحسنة",
      "المشاركة في الأنشطة والمناسبات",
      "النشر الإعلامي للفعاليات وأخبار المدارس",
      "الالتزام بالإشراف على الأطفال والمناوبات",
      "الالتزام بالزي الرسمي",
    ],
  },
  {
    key: "nursery-caregiver-weekly",
    id: "kg-principal-nursery-caregiver-weekly-evaluation-v1",
    title: "تقييم مديرة الروضة للحاضنة - المتابعة الأسبوعية",
    targetSlot: "caregiver",
    roleKey: "NURSERY_CAREGIVER",
    roleLabel: "الحاضنة",
    planKind: "WEEKLY",
    cycles: WEEKLY,
    items: [
      "الالتزام بالزي الرسمي",
      "النشر الإعلامي للفعاليات وأخبار المدارس",
      "السلوك العام والقدوة الحسنة",
      "المبادرة بتقبل التوجيهات",
      "حسن التصرف مع الرؤساء والزملاء وأولياء الأمور",
      "القيام بما يسند إليها من مهام",
      "المحافظة على نظافة الأطفال من دخولهم حتى وقت خروجهم",
      "المحافظة على نظافة الحضانة",
      "المحافظة والحرص على الممتلكات العامة",
    ],
  },
];

function initAdmin() {
  if (admin.apps.length) return;
  const serviceAccountPath = path.resolve(process.cwd(), "service-account.json");
  const serviceAccount = require(serviceAccountPath);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(value) {
  return asString(value).toLowerCase();
}

function isActive(data) {
  const status = asString(data.status).toUpperCase();
  return data.isActive !== false && data.active !== false &&
    !["DISABLED", "ENDED", "INACTIVE", "REVOKED", "REMOVED"].includes(status);
}

function membershipCoversSchool(data, schoolId) {
  return asString(data.schoolId) === schoolId || asString(data.scopeId) === schoolId ||
    data.scopes?.schoolIds?.includes(schoolId) || data.scopes?.canAccessAllSchools === true;
}

function chunk(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

async function readRequiredDoc(db, documentPath, label) {
  const snapshot = await db.doc(documentPath).get();
  assert(snapshot.exists, `${label} not found: ${documentPath}`);
  return snapshot;
}

async function loadPreflight(db) {
  const orgRoot = `orgs/${CONFIG.orgId}`;

  for (const school of CONFIG.schools) {
    const evaluator = school.evaluator;
    const [authUser, user, person, membership, operations, schoolDocument] = await Promise.all([
      admin.auth().getUser(evaluator.uid),
      readRequiredDoc(db, `users/${evaluator.uid}`, "Evaluator user"),
      readRequiredDoc(db, `${orgRoot}/people/${evaluator.personId}`, "Evaluator person"),
      readRequiredDoc(db, `users/${evaluator.uid}/orgMemberships/${CONFIG.orgId}`, "Evaluator membership"),
      db.collection(`${orgRoot}/operationalAssignments`).where("actorPersonId", "==", evaluator.personId).get(),
      readRequiredDoc(db, `${orgRoot}/schools/${school.id}`, "School"),
    ]);
    const membershipData = membership.data();
    assert(normalizeEmail(authUser.email) === evaluator.email, `${school.id} evaluator auth email mismatch.`);
    assert(normalizeEmail(user.data().email || person.data().email) === evaluator.email, `${school.id} evaluator user email mismatch.`);
    assert(asString(membershipData.personId) === evaluator.personId, `${school.id} evaluator personId mismatch.`);
    assert(asString(membershipData.roleKey || membershipData.role).toUpperCase() === "KG_PRINCIPAL", `${school.id} evaluator role mismatch.`);
    assert(isActive(membershipData) && membershipCoversSchool(membershipData, school.id), `${school.id} evaluator scope mismatch.`);
    assert(membershipData.permissions?.manageEvaluations === true, `${school.id} evaluator is missing manageEvaluations.`);
    assert(asString(person.data().displayName) === evaluator.displayName, `${school.id} evaluator displayName mismatch.`);
    assert(asString(schoolDocument.data().name || schoolDocument.data().title) === school.label, `${school.id} label mismatch.`);
    assert(operations.docs.some((document) => {
      const data = document.data();
      return isActive(data) && asString(data.operationKind) === "STAFF_EVALUATION" &&
        asString(data.schoolId || data.scopeId) === school.id;
    }), `${school.id} evaluator is missing STAFF_EVALUATION.`);

    for (const requestedTarget of Object.values(school.targets)) {
      const [targetAuth, targetPerson, targetMembership] = await Promise.all([
        admin.auth().getUser(requestedTarget.uid),
        readRequiredDoc(db, `${orgRoot}/people/${requestedTarget.personId}`, "Target person"),
        readRequiredDoc(db, `users/${requestedTarget.uid}/orgMemberships/${CONFIG.orgId}`, "Target membership"),
      ]);
      const targetData = targetMembership.data();
      assert(normalizeEmail(targetAuth.email) === requestedTarget.email, `${requestedTarget.personId} auth email mismatch.`);
      assert(asString(targetPerson.data().displayName) === requestedTarget.displayName, `${requestedTarget.personId} displayName mismatch.`);
      assert(normalizeEmail(targetPerson.data().email) === requestedTarget.email, `${requestedTarget.personId} person email mismatch.`);
      assert(asString(targetData.personId) === requestedTarget.personId, `${requestedTarget.personId} membership personId mismatch.`);
      assert(asString(targetData.roleKey || targetData.role).toUpperCase() === requestedTarget.roleKey, `${requestedTarget.personId} role mismatch.`);
      assert(asString(targetData.title) === requestedTarget.membershipTitle, `${requestedTarget.personId} title mismatch.`);
      assert(isActive(targetData) && membershipCoversSchool(targetData, school.id), `${requestedTarget.personId} scope mismatch.`);
    }
  }

  return { orgRoot };
}

function buildFrameworkDocuments(orgRoot) {
  const documents = [];
  for (const framework of FRAMEWORKS) {
    const sectionId = `${framework.id}-main`;
    documents.push({
      type: "framework",
      path: `${orgRoot}/evaluationFrameworks/${framework.id}`,
      data: {
        id: framework.id,
        orgId: CONFIG.orgId,
        title: framework.title,
        description: `قالب رسمي لـ${framework.title}.`,
        targetKind: "ADMIN",
        targetRoleLabel: framework.roleLabel,
        targetRoleKeyHint: framework.roleKey,
        evaluatorKind: "SCHOOL_PRINCIPAL",
        evaluatorLabel: "مديرة الروضة",
        defaultEvaluatorRoleKeys: ["KG_PRINCIPAL"],
        frameworkKind: "ADMIN_EVALUATION",
        schoolTypes: ["KG"],
        maxCyclesPerTerm: framework.cycles.length,
        defaultItemMaxScore: 5,
        isActive: true,
        isLocked: true,
        version: 1,
      },
    });
    documents.push({
      type: "section",
      path: `${orgRoot}/evaluationRubricSections/${sectionId}`,
      data: {
        id: sectionId,
        orgId: CONFIG.orgId,
        frameworkId: framework.id,
        title: framework.roleLabel,
        description: `بنود ${framework.title}.`,
        order: 1,
        weight: 100,
        isActive: true,
      },
    });
    framework.items.forEach((title, index) => {
      const itemId = `${sectionId}-${String(index + 1).padStart(2, "0")}`;
      documents.push({
        type: "item",
        path: `${orgRoot}/evaluationRubricItems/${itemId}`,
        data: {
          id: itemId,
          orgId: CONFIG.orgId,
          frameworkId: framework.id,
          sectionId,
          title,
          description: "",
          order: index + 1,
          maxScore: 5,
          scoreInputType: "SCORE",
          isRequired: true,
          isActive: true,
        },
      });
    });
  }
  return documents;
}

function buildPlanDocuments(orgRoot) {
  const documents = [];
  for (const school of CONFIG.schools) {
    for (const framework of FRAMEWORKS) {
      const requestedTarget = school.targets[framework.targetSlot];
      if (!requestedTarget) continue;
      const planId = `${school.id}-${CONFIG.academicYearId}-${CONFIG.termId}-${framework.key}-evaluation`;
      documents.push({
        type: "plan",
        planId,
        path: `${orgRoot}/evaluationPlans/${planId}`,
        data: {
          id: planId,
          orgId: CONFIG.orgId,
          schoolId: school.id,
          academicYearId: CONFIG.academicYearId,
          termId: CONFIG.termId,
          title: `${framework.title} - ${school.label} - الفصل الأول`,
          description: `خطة تطبيق ${framework.title} داخل الفصل الدراسي الأول.`,
          frameworkId: framework.id,
          planKind: framework.planKind,
          targetKind: "ADMIN",
          targetRoleKey: framework.roleKey,
          targetRoleLabel: framework.roleLabel,
          status: "ACTIVE",
        },
      });
      const policyId = `${planId}-policy-principal`;
      documents.push({
        type: "policy",
        planId,
        path: `${orgRoot}/evaluatorPolicies/${policyId}`,
        data: {
          id: policyId,
          orgId: CONFIG.orgId,
          schoolId: school.id,
          academicYearId: CONFIG.academicYearId,
          termId: CONFIG.termId,
          planId,
          evaluatorRoleKey: "KG_PRINCIPAL",
          evaluatorLabel: "مديرة الروضة",
          evaluatorPersonId: school.evaluator.personId,
          weight: 100,
          required: true,
          canSubmit: true,
          canReview: false,
          canApprove: true,
          order: 1,
        },
      });
      for (const cycle of framework.cycles) {
        const cycleId = `${planId}-${cycle.suffix}`;
        documents.push({
          type: "cycle",
          planId,
          path: `${orgRoot}/evaluationCycles/${cycleId}`,
          data: {
            id: cycleId,
            orgId: CONFIG.orgId,
            schoolId: school.id,
            academicYearId: CONFIG.academicYearId,
            termId: CONFIG.termId,
            planId,
            cycleNumber: cycle.number,
            title: cycle.title,
            cycleKind: cycle.kind,
            status: "OPEN",
            isIncludedInAverage: true,
          },
        });
      }
      const targetAssignmentId = `${planId}-target-${requestedTarget.personId}`;
      documents.push({
        type: "targetAssignment",
        planId,
        path: `${orgRoot}/evaluationTargetAssignments/${targetAssignmentId}`,
        data: {
          id: targetAssignmentId,
          orgId: CONFIG.orgId,
          schoolId: school.id,
          academicYearId: CONFIG.academicYearId,
          termId: CONFIG.termId,
          planId,
          targetPersonId: requestedTarget.personId,
          targetEmail: requestedTarget.email,
          targetDisplayName: requestedTarget.displayName,
          targetRoleKey: requestedTarget.roleKey,
          targetRoleLabel: framework.roleLabel,
          targetKind: "ADMIN",
          status: "ACTIVE",
        },
      });
      for (const cycle of framework.cycles) {
        const cycleId = `${planId}-${cycle.suffix}`;
        const assignmentId = `${cycleId}-${requestedTarget.personId}-${school.evaluator.personId}`;
        documents.push({
          type: "evaluatorAssignment",
          planId,
          path: `${orgRoot}/evaluationEvaluatorAssignments/${assignmentId}`,
          data: {
            id: assignmentId,
            orgId: CONFIG.orgId,
            schoolId: school.id,
            academicYearId: CONFIG.academicYearId,
            termId: CONFIG.termId,
            planId,
            cycleId,
            targetPersonId: requestedTarget.personId,
            targetRoleKey: requestedTarget.roleKey,
            targetRoleLabel: framework.roleLabel,
            evaluatorPersonId: school.evaluator.personId,
            evaluatorEmail: school.evaluator.email,
            evaluatorRoleKey: "KG_PRINCIPAL",
            weight: 100,
            sourceType: "MANUAL",
            status: "ACTIVE",
          },
        });
      }
    }
  }
  return documents;
}

function assertStructure(documents) {
  for (const framework of FRAMEWORKS) {
    const sections = documents.filter((document) => document.type === "section" && document.data.frameworkId === framework.id);
    const items = documents.filter((document) => document.type === "item" && document.data.frameworkId === framework.id);
    assert(sections.length === 1 && sections[0].data.weight === 100, `${framework.id} section validation failed.`);
    assert(items.length === framework.items.length, `${framework.id} item count mismatch.`);
    assert(items.every((item, index) => item.data.order === index + 1 && item.data.maxScore === 5), `${framework.id} item validation failed.`);
  }

  for (const school of CONFIG.schools) {
    for (const framework of FRAMEWORKS) {
      if (!school.targets[framework.targetSlot]) continue;
      const planId = `${school.id}-${CONFIG.academicYearId}-${CONFIG.termId}-${framework.key}-evaluation`;
      const planDocuments = documents.filter((document) => document.planId === planId);
      assert(planDocuments.filter((document) => document.type === "cycle").length === framework.cycles.length, `${planId} cycle count mismatch.`);
      assert(planDocuments.filter((document) => document.type === "targetAssignment").length === 1, `${planId} target count mismatch.`);
      assert(planDocuments.filter((document) => document.type === "evaluatorAssignment").length === framework.cycles.length, `${planId} evaluator count mismatch.`);
    }
  }
}

function assertExistingDocument(snapshot, desired) {
  const current = snapshot.data();
  for (const [field, expected] of Object.entries(desired.data)) {
    assert(JSON.stringify(current[field]) === JSON.stringify(expected), `Conflicting ${field} at ${snapshot.ref.path}: expected ${JSON.stringify(expected)}, found ${JSON.stringify(current[field])}`);
  }
}

async function inspectDocuments(db, documents) {
  const missing = [];
  const existing = [];
  for (const group of chunk(documents, 400)) {
    const snapshots = await db.getAll(...group.map((document) => db.doc(document.path)));
    snapshots.forEach((snapshot, index) => {
      const desired = group[index];
      if (!snapshot.exists) missing.push(desired);
      else {
        assertExistingDocument(snapshot, desired);
        existing.push(desired);
      }
    });
  }
  return { missing, existing };
}

function countByType(documents) {
  return documents.reduce((counts, document) => {
    counts[document.type] = (counts[document.type] || 0) + 1;
    return counts;
  }, {});
}

async function applyMissingDocuments(db, documents) {
  const now = Date.now();
  for (const group of chunk(documents, 400)) {
    const batch = db.batch();
    for (const document of group) {
      batch.create(db.doc(document.path), {
        ...document.data,
        createdAt: now,
        updatedAt: now,
        ...(document.type === "framework" ? { lockedAt: now } : {}),
        ...(document.type === "targetAssignment" ? { assignedAt: now } : {}),
      });
    }
    await batch.commit();
  }
}

async function verifyPlanCounts(db, orgRoot) {
  for (const school of CONFIG.schools) {
    for (const framework of FRAMEWORKS) {
      if (!school.targets[framework.targetSlot]) continue;
      const planId = `${school.id}-${CONFIG.academicYearId}-${CONFIG.termId}-${framework.key}-evaluation`;
      const [cycles, targets, assignments] = await Promise.all([
        db.collection(`${orgRoot}/evaluationCycles`).where("planId", "==", planId).get(),
        db.collection(`${orgRoot}/evaluationTargetAssignments`).where("planId", "==", planId).get(),
        db.collection(`${orgRoot}/evaluationEvaluatorAssignments`).where("planId", "==", planId).get(),
      ]);
      assert(cycles.docs.filter((document) => isActive(document.data())).length === framework.cycles.length, `${planId} active cycle verification failed.`);
      assert(targets.docs.filter((document) => isActive(document.data())).length === 1, `${planId} active target verification failed.`);
      assert(assignments.docs.filter((document) => isActive(document.data())).length === framework.cycles.length, `${planId} active evaluator verification failed.`);
    }
  }
}

function buildReport(documents, inspection) {
  return {
    schools: CONFIG.schools.map((school) => ({
      id: school.id,
      evaluator: school.evaluator.displayName,
      targets: Object.values(school.targets).map((requestedTarget) => `${requestedTarget.roleLabel}: ${requestedTarget.displayName}`),
    })),
    frameworks: FRAMEWORKS.map((framework) => ({
      id: framework.id,
      roleLabel: framework.roleLabel,
      cycles: framework.cycles.length,
      items: framework.items.length,
    })),
    desired: countByType(documents),
    existing: countByType(inspection.existing),
    missing: countByType(inspection.missing),
    total: documents.length,
  };
}

async function main() {
  initAdmin();
  const db = admin.firestore();
  const { orgRoot } = await loadPreflight(db);
  const documents = [
    ...buildFrameworkDocuments(orgRoot),
    ...buildPlanDocuments(orgRoot),
  ];
  assertStructure(documents);
  const inspection = await inspectDocuments(db, documents);
  console.log(APPLY ? "Apply mode" : "Preview mode (read-only)");
  console.dir(buildReport(documents, inspection), { depth: 10 });

  if (!APPLY) {
    console.log("No writes performed. Re-run with --apply to create missing documents.");
    return;
  }

  if (inspection.missing.length > 0) {
    await applyMissingDocuments(db, inspection.missing);
  }
  const verification = await inspectDocuments(db, documents);
  assert(verification.missing.length === 0, "Documents are still missing after apply.");
  await verifyPlanCounts(db, orgRoot);
  console.log("Kindergarten principal admin evaluations applied and verified.");
  console.dir({ verified: countByType(documents), total: documents.length });
}

main().catch((error) => {
  console.error("Kindergarten principal admin evaluation seed failed:");
  console.error(error);
  process.exitCode = 1;
});
