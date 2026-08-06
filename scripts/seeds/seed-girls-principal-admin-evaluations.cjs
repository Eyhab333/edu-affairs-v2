/* eslint-disable no-console */

const admin = require("firebase-admin");
const path = require("path");

const APPLY = process.argv.includes("--apply");

const CONFIG = {
  orgId: "takween",
  schoolId: "mrb-girls",
  schoolLabel: "مدرسة منار الريادة بنات",
  academicYearId: "ay-1448",
  termId: "term-1",
  evaluator: {
    uid: "okMSrTs9InbKydR0XGo90ZaBqJC2",
    personId: "p-n-albader",
    displayName: "نادية عثمان ناصر البدر",
    email: "n.albader@qz.org.sa",
    roleKey: "GIRLS_PRINCIPAL",
    roleLabel: "مديرة المدرسة",
  },
  people: {
    vicePrincipal: { personId: "p-f-alobawe", displayName: "فوزيه عبدالله مطلق العبيوي", email: "f.alobawe@qz.org.sa", roleKey: "GIRLS_VP", roleLabel: "الوكيلة" },
    counselor: { personId: "staff-Ivr7RIb0AoWIuKAgQTcK0LzKRCz1", displayName: "ساره ناصر محمد الحمد", email: "sarah@qz.org.sa", roleKey: "GIRLS_STUDENT_COUNSELOR", roleLabel: "الموجهة الطلابية" },
    activity: { personId: "p-hanaz", displayName: "هناء فراج سليمان الزنيدي", email: "hanaz@qz.org.sa", roleKey: "ACTIVITY_COORD", roleLabel: "رائدة النشاط" },
    adminAssistant: { personId: "p-aa-almansor", displayName: "أريج عبدالله عبدالرحمن المنصور", email: "aa.almansor@qz.org.sa", roleKey: "ADMIN_ASSISTANT", roleLabel: "المساعدة الإدارية" },
    monitor: { personId: "p-ny-almasoud", displayName: "نوره يوسف علي المسعود", email: "ny.almasoud@qz.org.sa", roleKey: "SCHOOL_MONITOR", roleLabel: "المراقبة" },
    media1: { personId: "p-r-almuhatrsh", displayName: "ريف فهد سعود المحترش", email: "r.almuhatrsh@qz.org.sa", roleKey: "MEDIA_SPECIALIST", roleLabel: "الإعلامية" },
    media2: { personId: "p-m-alfrraj", displayName: "مرام صالح جوير الفراج", email: "m.alfrraj@qz.org.sa", roleKey: "MEDIA_SPECIALIST", roleLabel: "الإعلامية" },
    caregiver1: { personId: "staff-yKCaFOjzBnWNe9NQygjNDkmVDcw1", displayName: "روعه إبراهيم احمد عبدالله", email: "r.abdallah@qz.org.sa", roleKey: "NURSERY_CAREGIVER", roleLabel: "الحاضنة" },
    caregiver2: { personId: "staff-aqqctmsdFbOWKWM7GrGd9kAblfK2", displayName: "هاجر إبراهيم احمدعبدالله", email: "h.abdallah@qz.org.sa", roleKey: "NURSERY_CAREGIVER", roleLabel: "الحاضنة" },
  },
};

const ORDINALS = [
  "الأول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس", "السابع", "الثامن", "التاسع",
  "العاشر", "الحادي عشر", "الثاني عشر", "الثالث عشر", "الرابع عشر", "الخامس عشر",
  "السادس عشر", "السابع عشر", "الثامن عشر", "التاسع عشر",
];

function evaluationCycles(count, prefix = "التقييم") {
  return ORDINALS.slice(0, count).map((ordinal, index) => ({
    number: index + 1,
    title: `${prefix} ${ordinal}`,
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

const TWICE = evaluationCycles(2);
const EVERY_TWO_WEEKS = evaluationCycles(9);
const WEEKLY = weeklyCycles();

const FRAMEWORKS = [
  {
    key: "vice-principal-periodic",
    id: "girls-principal-vice-principal-periodic-evaluation-v1",
    title: "تقييم مديرة المدرسة للوكيلة - المتابعة الدورية",
    roleKey: "GIRLS_VP",
    roleLabel: "الوكيلة",
    targets: [CONFIG.people.vicePrincipal],
    planKind: "PERIODIC",
    cycles: TWICE,
    items: [
      "زيارة المعلمات", "متابعة الكتب المدرسية", "قياس الوكيلة للمعلمات", "متابعة الفاقد التعليمي",
      "متابعة رصد المعلمات بالدرايف", "متابعة المعلمات للاختبارات التجميعية ورصدها وتحليلها",
      "حصر الطالبات المتعثرات وإعداد الخطط ومتابعة التقدم", "الإشراف على تنفيذ الاختبارات المركزية وتجميعها",
      "الإشراف على حضور الطالبات وانتظامهن", "الإشراف على الطابور الصباحي",
      "متابعة المعلمات بالمناهج والالتزام بخطة التوزيع", "المشاركة في إعداد الخطط المدرسية واللجان",
      "متابعة إنهاء المعلمات لتدريس جميع المواد وفق المنهج الزمني", "الاهتمام بالتطوير المهني والنمو المعرفي",
      "متابعة مجتمعات التعلم المهنية", "حسن التصرف مع الرؤساء والزملاء وأولياء الأمور",
      "السلوك العام والقدوة الحسنة", "المساهمة في تدريب الزملاء تقنيًا",
    ],
  },
  {
    key: "vice-principal-every-two-weeks",
    id: "girls-principal-vice-principal-every-two-weeks-evaluation-v1",
    title: "تقييم مديرة المدرسة للوكيلة - المتابعة كل أسبوعين",
    roleKey: "GIRLS_VP",
    roleLabel: "الوكيلة",
    targets: [CONFIG.people.vicePrincipal],
    planKind: "PERIODIC",
    cycles: EVERY_TWO_WEEKS,
    items: [
      "متابعة تحضير الدروس للمعلمات", "متابعة جميع السجلات (إتقان المهارات والمتابعة اليومية وغيرها)",
      "الإشراف على نظافة المرافق", "إعداد الجداول المدرسية", "متابعة التزام المعلمات بدخول الحصص",
      "متابعة التزام المعلمات بدخول حصص الانتظار", "متابعة النقل المدرسي",
      "متابعة مذكرة القياس والتقييم الأسبوعي", "المبادرة وتقبل التوجيهات",
      "القيام بما يسند إليها من مهام", "تنفيذ المبادرات والأنشطة",
      "النشر الإعلامي للفعاليات وأخبار المدرسة", "الالتزام والإشراف على الطالبات والمناوبات",
      "الالتزام بالزي الرسمي",
    ],
  },
  {
    key: "student-counselor-periodic",
    id: "girls-principal-student-counselor-periodic-evaluation-v1",
    title: "تقييم مديرة المدرسة للموجهة الطلابية - المتابعة الدورية",
    roleKey: "GIRLS_STUDENT_COUNSELOR",
    roleLabel: "الموجهة الطلابية",
    targets: [CONFIG.people.counselor],
    planKind: "PERIODIC",
    cycles: TWICE,
    items: [
      "تنفيذ برامج التوجيه والإرشاد", "دراسة المشكلات في المجتمع المدرسي",
      "متابعة مذكرة الواجبات وفق خطة زمنية وتفعيلها", "اكتشاف الطالبات المتفوقات والموهوبات ورعايتهن",
      "متابعة المتأخرات دراسيًا ودراسة الأسباب وعلاجها", "عقد اللقاءات مع أولياء الأمور لحل المشكلات",
      "حصر نتائج الاختبارات الفصلية ودراستها مع إدارة المدرسة والمعلمات", "تفعيل الإرشاد النفسي والجمعي",
      "متابعة التحسن في نتائج التعلم", "متابعة السجل الصحي للطالبات",
      "متابعة الظواهر السلوكية في المدرسة ومتابعة علاجها", "تنفيذ الخطط والبرامج لرعاية الموهوبات",
      "تعزيز الانضباط والسلوك الإيجابي", "حسن التصرف مع الرؤساء والزملاء وأولياء الأمور",
      "السلوك العام والقدوة الحسنة", "الاهتمام بالتطوير المهني والنمو المعرفي",
      "المساهمة في تدريب الزملاء تقنيًا", "تفعيل المبادرات التعليمية",
    ],
  },
  {
    key: "student-counselor-every-two-weeks",
    id: "girls-principal-student-counselor-every-two-weeks-evaluation-v1",
    title: "تقييم مديرة المدرسة للموجهة الطلابية - المتابعة كل أسبوعين",
    roleKey: "GIRLS_STUDENT_COUNSELOR",
    roleLabel: "الموجهة الطلابية",
    targets: [CONFIG.people.counselor],
    planKind: "PERIODIC",
    cycles: EVERY_TWO_WEEKS,
    items: [
      "متابعة وتنفيذ السجلات والاستمارات المنظمة للعمل الإرشادي",
      "إعداد إشعارات الغياب بدون عذر والتواصل مع أولياء الأمور", "تقبل التوجيهات",
      "القيام بما يسند إليها من مهام", "تنفيذ المبادرات والأنشطة",
      "النشر الإعلامي للفعاليات وأخبار المدرسة", "الالتزام والإشراف على الطالبات والمناوبات",
      "الالتزام بالزي الرسمي",
    ],
  },
  {
    key: "media-every-two-weeks",
    id: "girls-principal-media-every-two-weeks-evaluation-v1",
    title: "تقييم مديرة المدرسة للإعلامية - المتابعة كل أسبوعين",
    roleKey: "MEDIA_SPECIALIST",
    roleLabel: "الإعلامية",
    targets: [CONFIG.people.media1, CONFIG.people.media2],
    planKind: "PERIODIC",
    cycles: EVERY_TWO_WEEKS,
    items: [
      "تقبل التوجيهات", "التوثيق اليومي", "تنفيذ الخطة الإعلامية", "القيام بما يسند إليها من مهام",
      "النشر الإعلامي للفعاليات وأخبار المدرسة", "الالتزام والإشراف على الطالبات والمناوبات",
      "الالتزام بالزي الرسمي",
    ],
  },
  {
    key: "media-periodic",
    id: "girls-principal-media-periodic-evaluation-v1",
    title: "تقييم مديرة المدرسة للإعلامية - المتابعة الدورية",
    roleKey: "MEDIA_SPECIALIST",
    roleLabel: "الإعلامية",
    targets: [CONFIG.people.media1, CONFIG.people.media2],
    planKind: "PERIODIC",
    cycles: TWICE,
    items: [
      "توثيق الممارسات", "خطة المناسبات", "توثيق الأنشطة", "توثيق الإذاعة", "إبراز الإنجازات",
      "إدارة الملف الإعلامي", "رفع التقارير الإعلامية", "التطوير المهني والنمو المعرفي",
      "المساهمة في تدريب الزملاء تقنيًا", "حسن التصرف مع الرؤساء والزملاء وأولياء الأمور",
      "السلوك العام والقدوة الحسنة",
    ],
  },
  {
    key: "activity-every-two-weeks",
    id: "girls-principal-activity-every-two-weeks-evaluation-v1",
    title: "تقييم مديرة المدرسة لرائدة النشاط - المتابعة كل أسبوعين",
    roleKey: "ACTIVITY_COORD",
    roleLabel: "رائدة النشاط",
    targets: [CONFIG.people.activity],
    planKind: "PERIODIC",
    cycles: EVERY_TWO_WEEKS,
    items: [
      "تقبل التوجيهات", "القيام بما يسند إليها من مهام", "تنفيذ المبادرات والأنشطة",
      "تفعيل الإذاعة المدرسية", "النشر الإعلامي للفعاليات وأخبار المدرسة",
      "الالتزام والإشراف على الطالبات والمناوبات", "الالتزام بالزي الرسمي",
    ],
  },
  {
    key: "activity-periodic",
    id: "girls-principal-activity-periodic-evaluation-v1",
    title: "تقييم مديرة المدرسة لرائدة النشاط - المتابعة الدورية",
    roleKey: "ACTIVITY_COORD",
    roleLabel: "رائدة النشاط",
    targets: [CONFIG.people.activity],
    planKind: "PERIODIC",
    cycles: TWICE,
    items: [
      "تنفيذ الأنشطة والبرامج", "تنفيذ خطة الإذاعة", "تنمية المهارات الطلابية",
      "إعداد المسابقات التعليمية والإثرائية", "تفعيل المبادرات التعليمية",
      "إعداد الجدول السنوي للفعاليات والمناسبات وتفعيله", "تفعيل الزيارات الطلابية",
      "تفعيل الأيام المفتوحة", "دعم الأهداف التعليمية من خلال الأنشطة المدرسية",
      "إعداد تقرير الأنشطة والإنجازات والمعوقات أثناء تنفيذ المهام", "التطوير المهني والنمو المعرفي",
      "المساهمة في تدريب الزملاء تقنيًا", "حسن التصرف مع الرؤساء والزملاء وأولياء الأمور",
      "السلوك العام والقدوة الحسنة",
    ],
  },
  {
    key: "admin-assistant-periodic",
    id: "girls-principal-admin-assistant-periodic-evaluation-v1",
    title: "تقييم مديرة المدرسة للمساعدة الإدارية - المتابعة الدورية",
    roleKey: "ADMIN_ASSISTANT",
    roleLabel: "المساعدة الإدارية",
    targets: [CONFIG.people.adminAssistant],
    planKind: "PERIODIC",
    cycles: TWICE,
    items: [
      "تنظيم وحفظ سجلات الإدارة", "إعداد النماذج والوثائق والمستندات الخاصة بالطالبات",
      "متابعة وتنظيم وحفظ سجلات الطالبات في نظام نور وغيره", "تقديم الدعم للعمليات المدرسية والتنظيمية والإدارية",
      "إدارة ومتابعة المنصات (نور ومدارس وراصد) وتحديث البيانات", "تنظيم اجتماعات المدرسة وتوثيقها",
      "تسجيل وتسليم العهد لجميع العاملين", "إدارة وتنظيم أعمال المستودع",
      "المتابعة والتأكد من إدخال جميع نتائج الاختبارات على النظام المعتمد في وقتها",
      "الاهتمام بالتطوير المهني والنمو المعرفي", "المساهمة في تدريب الزملاء تقنيًا",
      "حسن التصرف مع الرؤساء والزملاء وأولياء الأمور", "السلوك العام والقدوة الحسنة",
      "تفعيل المبادرات التعليمية",
    ],
  },
  {
    key: "admin-assistant-every-two-weeks",
    id: "girls-principal-admin-assistant-every-two-weeks-evaluation-v1",
    title: "تقييم مديرة المدرسة للمساعدة الإدارية - المتابعة كل أسبوعين",
    roleKey: "ADMIN_ASSISTANT",
    roleLabel: "المساعدة الإدارية",
    targets: [CONFIG.people.adminAssistant],
    planKind: "PERIODIC",
    cycles: EVERY_TWO_WEEKS,
    items: [
      "الأعمال الكتابية والإدارية", "تقبل التوجيهات", "القيام بما يسند إليها من مهام",
      "تنفيذ المبادرات والأنشطة", "النشر الإعلامي للفعاليات وأخبار المدرسة",
      "الالتزام والإشراف على الطالبات والمناوبات", "الالتزام بالزي الرسمي",
    ],
  },
  {
    key: "monitor-weekly",
    id: "girls-principal-monitor-weekly-evaluation-v1",
    title: "تقييم مديرة المدرسة للمراقبة - المتابعة الأسبوعية",
    roleKey: "SCHOOL_MONITOR",
    roleLabel: "المراقبة",
    targets: [CONFIG.people.monitor],
    planKind: "WEEKLY",
    cycles: WEEKLY,
    items: [
      "متابعة تأخر الطالبات وتسجيله", "مراقبة انتظام الحصص ودخول المعلمات",
      "متابعة استئذان الطالبات", "متابعة المقصف المدرسي", "المبادرة وتقبل التوجيهات",
      "القيام بما يسند إليها من مهام", "تنفيذ المبادرات والأنشطة",
      "النشر الإعلامي للفعاليات وأخبار المدرسة", "الالتزام والإشراف على الطالبات والمناوبات",
      "الالتزام بالزي الرسمي",
    ],
  },
  {
    key: "monitor-periodic",
    id: "girls-principal-monitor-periodic-evaluation-v1",
    title: "تقييم مديرة المدرسة للمراقبة - المتابعة الفترية",
    roleKey: "SCHOOL_MONITOR",
    roleLabel: "المراقبة",
    targets: [CONFIG.people.monitor],
    planKind: "PERIODIC",
    cycles: TWICE,
    items: [
      "حصر الطالبات المتأخرات والرفع بهن", "التعاون في تطبيق لوائح الانضباط المدرسي",
      "الاهتمام بالتطوير المهني والنمو المعرفي", "المساهمة في تدريب الزملاء تقنيًا",
      "السلوك العام والقدوة الحسنة", "تفعيل المبادرات التعليمية",
      "حسن التصرف مع الرؤساء والزملاء وأولياء الأمور",
    ],
  },
  {
    key: "nursery-caregiver-weekly",
    id: "girls-principal-nursery-caregiver-weekly-evaluation-v1",
    title: "تقييم مديرة المدرسة للحاضنة - المتابعة الأسبوعية",
    roleKey: "NURSERY_CAREGIVER",
    roleLabel: "الحاضنة",
    targets: [CONFIG.people.caregiver1, CONFIG.people.caregiver2],
    planKind: "WEEKLY",
    cycles: WEEKLY,
    items: [
      "الالتزام بالزي الرسمي", "النشر الإعلامي للفعاليات وأخبار المدرسة",
      "السلوك العام والقدوة الحسنة", "المبادرة وتقبل التوجيهات",
      "حسن التصرف مع الرؤساء والزملاء وأولياء الأمور", "القيام بما يسند إليها من مهام",
      "المحافظة على نظافة الأطفال من دخولهم حتى وقت خروجهم", "المحافظة على نظافة الحضانة",
      "المحافظة والحرص على الممتلكات العامة",
    ],
  },
];

function initAdmin() {
  if (admin.apps.length) return;
  const serviceAccountPath = path.resolve(process.cwd(), "service-account.json");
  const serviceAccount = require(serviceAccountPath);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId: serviceAccount.project_id });
}

function assert(condition, message) { if (!condition) throw new Error(message); }
function asString(value) { return typeof value === "string" ? value.trim() : ""; }
function normalizeEmail(value) { return asString(value).toLowerCase(); }
function isActive(data) {
  const status = asString(data.status).toUpperCase();
  return data.isActive !== false && data.active !== false && !["DISABLED", "ENDED", "INACTIVE", "REVOKED", "REMOVED"].includes(status);
}
function membershipCoversSchool(data) {
  return asString(data.schoolId) === CONFIG.schoolId || asString(data.scopeId) === CONFIG.schoolId || data.scopes?.schoolIds?.includes(CONFIG.schoolId) || data.scopes?.canAccessAllSchools === true;
}
function chunk(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}
async function readRequiredDoc(db, documentPath, label) {
  const snapshot = await db.doc(documentPath).get();
  assert(snapshot.exists, `${label} not found: ${documentPath}`);
  return snapshot;
}

async function loadPreflight(db) {
  const orgRoot = `orgs/${CONFIG.orgId}`;
  const evaluator = CONFIG.evaluator;
  const [authUser, user, person, membership, operations, school] = await Promise.all([
    admin.auth().getUser(evaluator.uid),
    readRequiredDoc(db, `users/${evaluator.uid}`, "Evaluator user"),
    readRequiredDoc(db, `${orgRoot}/people/${evaluator.personId}`, "Evaluator person"),
    readRequiredDoc(db, `users/${evaluator.uid}/orgMemberships/${CONFIG.orgId}`, "Evaluator membership"),
    db.collection(`${orgRoot}/operationalAssignments`).where("actorPersonId", "==", evaluator.personId).get(),
    readRequiredDoc(db, `${orgRoot}/schools/${CONFIG.schoolId}`, "School"),
  ]);
  const membershipData = membership.data();
  assert(normalizeEmail(authUser.email) === evaluator.email, "Evaluator auth email mismatch.");
  assert(normalizeEmail(user.data().email || person.data().email) === evaluator.email, "Evaluator user email mismatch.");
  assert(asString(membershipData.personId) === evaluator.personId, "Evaluator personId mismatch.");
  assert(asString(membershipData.roleKey || membershipData.role).toUpperCase() === evaluator.roleKey, "Evaluator role mismatch.");
  assert(isActive(membershipData) && membershipCoversSchool(membershipData), "Evaluator membership/scope mismatch.");
  assert(membershipData.permissions?.manageEvaluations === true, "Evaluator is missing manageEvaluations.");
  assert(asString(person.data().displayName) === evaluator.displayName, "Evaluator displayName mismatch.");
  assert(asString(school.data().name || school.data().title) === CONFIG.schoolLabel, "School label mismatch.");
  assert(operations.docs.some((document) => isActive(document.data()) && asString(document.data().operationKind) === "STAFF_EVALUATION" && asString(document.data().schoolId || document.data().scopeId) === CONFIG.schoolId), "Evaluator is missing STAFF_EVALUATION.");

  const targets = Array.from(new Map(FRAMEWORKS.flatMap((framework) => framework.targets).map((target) => [target.personId, target])).values());
  for (const target of targets) {
    const [targetPerson, users] = await Promise.all([
      readRequiredDoc(db, `${orgRoot}/people/${target.personId}`, "Target person"),
      db.collection("users").where("personId", "==", target.personId).get(),
    ]);
    assert(asString(targetPerson.data().displayName) === target.displayName, `${target.personId} displayName mismatch.`);
    assert(normalizeEmail(targetPerson.data().email) === target.email, `${target.personId} email mismatch.`);
    assert(users.size === 1, `${target.personId} must have exactly one user.`);
    const targetMembership = await readRequiredDoc(db, `users/${users.docs[0].id}/orgMemberships/${CONFIG.orgId}`, "Target membership");
    const targetMembershipData = targetMembership.data();
    assert(isActive(targetMembershipData) && membershipCoversSchool(targetMembershipData), `${target.personId} membership/scope mismatch.`);
    assert(asString(targetMembershipData.roleKey || targetMembershipData.role).toUpperCase() === target.roleKey, `${target.personId} role mismatch.`);
  }
  return { orgRoot, targets };
}

function buildDocuments(orgRoot) {
  const documents = [];
  for (const framework of FRAMEWORKS) {
    const sectionId = `${framework.id}-main`;
    const planId = `${CONFIG.schoolId}-${CONFIG.academicYearId}-${CONFIG.termId}-${framework.key}-evaluation`;
    documents.push({ type: "framework", path: `${orgRoot}/evaluationFrameworks/${framework.id}`, data: {
      id: framework.id, orgId: CONFIG.orgId, title: framework.title, description: `قالب رسمي لـ${framework.title}.`,
      targetKind: "ADMIN", targetRoleLabel: framework.roleLabel, targetRoleKeyHint: framework.roleKey,
      evaluatorKind: "SCHOOL_PRINCIPAL", evaluatorLabel: CONFIG.evaluator.roleLabel,
      defaultEvaluatorRoleKeys: [CONFIG.evaluator.roleKey], frameworkKind: "ADMIN_EVALUATION",
      schoolTypes: ["PRIMARY"], maxCyclesPerTerm: framework.cycles.length, defaultItemMaxScore: 5,
      isActive: true, isLocked: true, version: 1,
    }});
    documents.push({ type: "section", path: `${orgRoot}/evaluationRubricSections/${sectionId}`, data: {
      id: sectionId, orgId: CONFIG.orgId, frameworkId: framework.id, title: framework.roleLabel,
      description: `بنود ${framework.title}.`, order: 1, weight: 100, isActive: true,
    }});
    framework.items.forEach((title, index) => {
      const itemId = `${sectionId}-${String(index + 1).padStart(2, "0")}`;
      documents.push({ type: "item", path: `${orgRoot}/evaluationRubricItems/${itemId}`, data: {
        id: itemId, orgId: CONFIG.orgId, frameworkId: framework.id, sectionId, title, description: "",
        order: index + 1, maxScore: 5, scoreInputType: "SCORE", isRequired: true, isActive: true,
      }});
    });
    documents.push({ type: "plan", planId, path: `${orgRoot}/evaluationPlans/${planId}`, data: {
      id: planId, orgId: CONFIG.orgId, schoolId: CONFIG.schoolId, academicYearId: CONFIG.academicYearId,
      termId: CONFIG.termId, title: `${framework.title} - ${CONFIG.schoolLabel} - الفصل الأول`,
      description: `خطة تطبيق ${framework.title} داخل الفصل الدراسي الأول.`, frameworkId: framework.id,
      planKind: framework.planKind, targetKind: "ADMIN", targetRoleKey: framework.roleKey,
      targetRoleLabel: framework.roleLabel, status: "ACTIVE",
    }});
    const policyId = `${planId}-policy-principal`;
    documents.push({ type: "policy", planId, path: `${orgRoot}/evaluatorPolicies/${policyId}`, data: {
      id: policyId, orgId: CONFIG.orgId, schoolId: CONFIG.schoolId, academicYearId: CONFIG.academicYearId,
      termId: CONFIG.termId, planId, evaluatorRoleKey: CONFIG.evaluator.roleKey,
      evaluatorLabel: CONFIG.evaluator.roleLabel, evaluatorPersonId: CONFIG.evaluator.personId,
      weight: 100, required: true, canSubmit: true, canReview: false, canApprove: true, order: 1,
    }});
    for (const cycle of framework.cycles) {
      const cycleId = `${planId}-${cycle.suffix}`;
      documents.push({ type: "cycle", planId, path: `${orgRoot}/evaluationCycles/${cycleId}`, data: {
        id: cycleId, orgId: CONFIG.orgId, schoolId: CONFIG.schoolId, academicYearId: CONFIG.academicYearId,
        termId: CONFIG.termId, planId, cycleNumber: cycle.number, title: cycle.title, cycleKind: cycle.kind,
        status: "OPEN", isIncludedInAverage: true,
      }});
    }
    for (const target of framework.targets) {
      const targetAssignmentId = `${planId}-target-${target.personId}`;
      documents.push({ type: "targetAssignment", planId, path: `${orgRoot}/evaluationTargetAssignments/${targetAssignmentId}`, data: {
        id: targetAssignmentId, orgId: CONFIG.orgId, schoolId: CONFIG.schoolId,
        academicYearId: CONFIG.academicYearId, termId: CONFIG.termId, planId,
        targetPersonId: target.personId, targetEmail: target.email, targetDisplayName: target.displayName,
        targetRoleKey: target.roleKey, targetRoleLabel: target.roleLabel, targetKind: "ADMIN", status: "ACTIVE",
      }});
      for (const cycle of framework.cycles) {
        const cycleId = `${planId}-${cycle.suffix}`;
        const assignmentId = `${cycleId}-${target.personId}-${CONFIG.evaluator.personId}`;
        documents.push({ type: "evaluatorAssignment", planId, path: `${orgRoot}/evaluationEvaluatorAssignments/${assignmentId}`, data: {
          id: assignmentId, orgId: CONFIG.orgId, schoolId: CONFIG.schoolId,
          academicYearId: CONFIG.academicYearId, termId: CONFIG.termId, planId, cycleId,
          targetPersonId: target.personId, targetRoleKey: target.roleKey, targetRoleLabel: target.roleLabel,
          evaluatorPersonId: CONFIG.evaluator.personId, evaluatorEmail: CONFIG.evaluator.email,
          evaluatorRoleKey: CONFIG.evaluator.roleKey, weight: 100, sourceType: "MANUAL", status: "ACTIVE",
        }});
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
    const planId = `${CONFIG.schoolId}-${CONFIG.academicYearId}-${CONFIG.termId}-${framework.key}-evaluation`;
    const planDocuments = documents.filter((document) => document.planId === planId);
    assert(planDocuments.filter((document) => document.type === "cycle").length === framework.cycles.length, `${planId} cycle count mismatch.`);
    assert(planDocuments.filter((document) => document.type === "targetAssignment").length === framework.targets.length, `${planId} target count mismatch.`);
    assert(planDocuments.filter((document) => document.type === "evaluatorAssignment").length === framework.targets.length * framework.cycles.length, `${planId} evaluator count mismatch.`);
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
      else { assertExistingDocument(snapshot, desired); existing.push(desired); }
    });
  }
  return { missing, existing };
}
function countByType(documents) {
  return documents.reduce((counts, document) => { counts[document.type] = (counts[document.type] || 0) + 1; return counts; }, {});
}
async function applyMissingDocuments(db, documents) {
  const now = Date.now();
  for (const group of chunk(documents, 400)) {
    const batch = db.batch();
    for (const document of group) batch.create(db.doc(document.path), {
      ...document.data, createdAt: now, updatedAt: now,
      ...(document.type === "framework" ? { lockedAt: now } : {}),
      ...(document.type === "targetAssignment" ? { assignedAt: now } : {}),
    });
    await batch.commit();
  }
}
async function verifyPlanCounts(db, orgRoot) {
  for (const framework of FRAMEWORKS) {
    const planId = `${CONFIG.schoolId}-${CONFIG.academicYearId}-${CONFIG.termId}-${framework.key}-evaluation`;
    const [cycles, targets, assignments] = await Promise.all([
      db.collection(`${orgRoot}/evaluationCycles`).where("planId", "==", planId).get(),
      db.collection(`${orgRoot}/evaluationTargetAssignments`).where("planId", "==", planId).get(),
      db.collection(`${orgRoot}/evaluationEvaluatorAssignments`).where("planId", "==", planId).get(),
    ]);
    assert(cycles.docs.filter((document) => isActive(document.data())).length === framework.cycles.length, `${planId} active cycle verification failed.`);
    assert(targets.docs.filter((document) => isActive(document.data())).length === framework.targets.length, `${planId} active target verification failed.`);
    assert(assignments.docs.filter((document) => isActive(document.data())).length === framework.targets.length * framework.cycles.length, `${planId} active evaluator verification failed.`);
  }
}
function buildReport(documents, inspection) {
  return {
    evaluator: CONFIG.evaluator,
    frameworks: FRAMEWORKS.map((framework) => ({ id: framework.id, roleLabel: framework.roleLabel, cycles: framework.cycles.length, items: framework.items.length, targets: framework.targets.map((target) => target.displayName) })),
    desired: countByType(documents), existing: countByType(inspection.existing), missing: countByType(inspection.missing), total: documents.length,
  };
}

async function main() {
  initAdmin();
  const db = admin.firestore();
  const preflight = await loadPreflight(db);
  const documents = buildDocuments(preflight.orgRoot);
  assertStructure(documents);
  const inspection = await inspectDocuments(db, documents);
  console.log(APPLY ? "Apply mode" : "Preview mode (read-only)");
  console.dir(buildReport(documents, inspection), { depth: 8 });
  if (!APPLY) { console.log("No writes performed. Re-run with --apply to create missing documents."); return; }
  if (inspection.missing.length > 0) await applyMissingDocuments(db, inspection.missing);
  const verification = await inspectDocuments(db, documents);
  assert(verification.missing.length === 0, "Documents are still missing after apply.");
  await verifyPlanCounts(db, preflight.orgRoot);
  console.log("Girls principal admin evaluations applied and verified.");
  console.dir({ verified: countByType(documents), total: documents.length });
}

main().catch((error) => {
  console.error("Girls principal admin evaluation seed failed:");
  console.error(error);
  process.exitCode = 1;
});
