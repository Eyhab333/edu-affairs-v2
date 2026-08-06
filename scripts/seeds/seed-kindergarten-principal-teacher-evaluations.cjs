/* eslint-disable no-console */

const admin = require("firebase-admin");
const path = require("path");

const APPLY = process.argv.includes("--apply");

const CONFIG = {
  orgId: "takween",
  academicYearId: "ay-1448",
  termId: "term-1",
  schools: [
    school(
      "kg-01",
      "روضة واحة الرياحين الأولى",
      evaluator("aTZHsoDfPBU6Ej5lMG1Ilcny3j73", "p-a-alhomidi", "أشواق الحميدي الحميدي", "a.alhomidi@qz.org.sa"),
      teacher("Cjt5ZpOPXOQxG2sQh6tTUj9Edu63", "p-ma-alfarhod", "منى احمد محمد الفرهود", "ma.alfarhod@qz.org.sa"),
      teacher("6pym4mAT1wX9Gw4OeGDGZARbCPJ3", "p-h-alarajh", "حصة عيسى حمد العراجة", "h.alarajh@qz.org.sa"),
      13,
    ),
    school(
      "kg-02",
      "روضة واحة الرياحين الثانية",
      evaluator("jGr6C7kUcGOr1M8crXi1kFIiATr2", "p-s-alturiqe", "سارة عبدالرحمن الطريقي", "s.alturiqe@qz.org.sa"),
      teacher("RWyxo00bfrX2jPcCRGUfxASoT4o2", "p-r-albatel", "رهام سويد محمد الباتل", "r.albatel@qz.org.sa"),
      teacher("A0K0ctyJVyZCjp4wO3IBF14Upd32", "p-h-almadallah", "حصه عبدالعزيز محمد المدالله", "h.almadallah@qz.org.sa"),
      13,
    ),
    school(
      "kg-03",
      "روضة واحة الرياحين الثالثة",
      evaluator("v2v5vCne5VPgu8XPX2uZW2JpOjO2", "p-s-alnafea", "سمية أحمد راشد النافع", "s.alnafea@qz.org.sa"),
      teacher("MJVVV75dEeU3LrFk0C6XRB8Fc6r1", "p-ss-alfaleh", "سارة سعود محمد الفالح", "ss.alfaleh@qz.org.sa"),
      teacher("i2LDsRAINLbVxxha3Hm2yg3MFvC2", "p-r-alfayez", "رغده سليمان محمد الفايز", "r.alfayez@qz.org.sa"),
      11,
    ),
    school(
      "kg-04",
      "روضة واحة الرياحين الرابعة",
      evaluator("uVQmM9JaIWWvMzLuaWZs4VDB7zD3", "p-n-alhamiyn", "نورة علي عبدالعزيز الحمين", "n.alhamiyn@qz.org.sa"),
      teacher("uy60CMhBPLUDXWRJ8NlmemfwfDe2", "p-s-bader", "ساره عبدالله علي البدر", "s.bader@qz.org.sa"),
      teacher("uy60CMhBPLUDXWRJ8NlmemfwfDe2", "p-s-bader", "ساره عبدالله علي البدر", "s.bader@qz.org.sa"),
      7,
    ),
  ],
};

function evaluator(uid, personId, displayName, email) {
  return { uid, personId, displayName, email };
}

function teacher(uid, personId, displayName, email) {
  return { uid, personId, displayName, email, roleKey: "KG_TEACHER" };
}

function school(id, label, requestedEvaluator, valuesTeacher, cornersTeacher, expectedTeacherCount) {
  return { id, label, evaluator: requestedEvaluator, valuesTeacher, cornersTeacher, expectedTeacherCount };
}

const ORDINALS = [
  "الأول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس", "السابع", "الثامن", "التاسع",
  "العاشر", "الحادي عشر", "الثاني عشر", "الثالث عشر", "الرابع عشر", "الخامس عشر",
  "السادس عشر", "السابع عشر", "الثامن عشر", "التاسع عشر",
];

const WEEKLY = ORDINALS.map((ordinal, index) => ({
  number: index + 1,
  title: `الأسبوع ${ordinal}`,
  suffix: `week-${String(index + 1).padStart(2, "0")}`,
  kind: "WEEK",
}));

const TWICE = ORDINALS.slice(0, 2).map((ordinal, index) => ({
  number: index + 1,
  title: `التقييم ${ordinal}`,
  suffix: `evaluation-${String(index + 1).padStart(2, "0")}`,
  kind: "VISIT",
}));

const FRAMEWORKS = [
  {
    key: "values-teacher-periodic",
    id: "kg-principal-values-teacher-periodic-evaluation-v1",
    title: "تقييم مديرة الروضة لمعلمة القيم - التقييم الدوري",
    targetSlot: "valuesTeachers",
    roleLabel: "معلمة القيم",
    planKind: "PERIODIC",
    frameworkKind: "PERIODIC_STAFF_EVALUATION",
    cycles: TWICE,
    items: [
      "تفعيل سجل الواجبات",
      "متابعة تنفيذ الملخص الأسبوعي",
      "تنفيذ الأنشطة المدرسية واللاصفية والمبادرات",
      "تفعيل استمارة تقييم الأطفال",
      "المبادرة في تقبل وتنفيذ التوجيهات",
      "الالتزام بالزي الرسمي",
      "المساهمة في تدريب الزملاء تقنيًا",
      "تفعيل الزيارات المتبادلة",
      "متابعة تنفيذ مجتمعات التعلم المهنية",
      "تصميم أوراق عمل متنوعة ومميزة تخدم القيم المقدمة للأطفال",
      "تفعيل التحضير",
    ],
  },
  {
    key: "values-teacher-weekly",
    id: "kg-principal-values-teacher-weekly-evaluation-v1",
    title: "تقييم مديرة الروضة لمعلمة القيم - التقييم الأسبوعي",
    targetSlot: "valuesTeachers",
    roleLabel: "معلمة القيم",
    planKind: "WEEKLY",
    frameworkKind: "WEEKLY_TEACHER_EVALUATION",
    cycles: WEEKLY,
    items: [
      "تفعيل سجل الواجبات",
      "متابعة تنفيذ الملخص الأسبوعي",
      "المبادرة في تقبل وتنفيذ التوجيهات",
      "الالتزام بالزي الرسمي",
      "الالتزام والإشراف على الأطفال والمناوبات",
      "التواصل الفعال مع أولياء الأمور",
      "النشر الإعلامي للفعاليات وأخبار المدارس",
      "القيام بما يسند إليها من مهام",
      "حسن التصرف مع الرؤساء والزملاء وأولياء الأمور",
      "المناوبة الصباحية واستقبال الأطفال",
      "متابعة التزام المعلمة بدخول الحصص",
    ],
  },
  {
    key: "corners-teacher-weekly",
    id: "kg-principal-corners-teacher-weekly-evaluation-v1",
    title: "تقييم مديرة الروضة لمعلمة الأركان - التقييم الأسبوعي",
    targetSlot: "cornersTeachers",
    roleLabel: "معلمة الأركان",
    planKind: "WEEKLY",
    frameworkKind: "WEEKLY_TEACHER_EVALUATION",
    cycles: WEEKLY,
    items: [
      "متابعة تنفيذ أوراق العمل",
      "تفعيل ملف إنجاز الأطفال",
      "تفعيل استمارة تقييم الأطفال",
      "اكتمال التحضير وتوافقه مع توزيع المنهج",
      "الالتزام بالزي الرسمي",
      "المبادرة في تقبل وتنفيذ التوجيهات",
      "الالتزام بالإشراف على الأطفال والمناوبات والمناوبة الصباحية ونهاية الدوام",
      "النشر الإعلامي للفعاليات وأخبار المدارس",
      "السلوك العام والقدوة الحسنة",
      "القيام بما يسند إليها من مهام",
      "حسن التصرف مع الرؤساء والزملاء وأولياء الأمور",
    ],
  },
  {
    key: "corners-teacher-diagnostic",
    id: "kg-principal-corners-teacher-diagnostic-evaluation-v1",
    title: "تقييم مديرة الروضة لمعلمة الأركان - الزيارة التشخيصية",
    targetSlot: "cornersTeachers",
    roleLabel: "معلمة الأركان",
    planKind: "PERIODIC",
    frameworkKind: "CLASSROOM_VISIT",
    cycles: TWICE,
    items: [
      "تقدر المسؤولية وتلتزم بأخلاقيات المهنة والتعليمات التنظيمية",
      "إدارة حوار وأسئلة مفتوحة مع الأطفال داخل المراكز",
      "المهارة في إدارة المراكز التعليمية",
      "عرض النشاط بطريقة متسلسلة ومشوقة ومترابطة",
      "تحقيق أهداف المراكز التعليمية",
      "تفعيل مراكز التعلم بمهارة عالية",
      "استخدام استراتيجيات تعلم فعالة وتوظيف تقنيات التعلم",
      "تهيئة بيئة الصف قبل بدء الدرس (التنظيم)",
      "توظيف استراتيجيات تربوية في معالجة سلوك المتعلمين تدعم اكتساب القيم والمبادئ",
      "تطوير مراكز التعلم بشكل مستمر",
      "الاهتمام بالتطور المهني والنمو المعرفي",
      "الالتزام بمواءمة أنشطة المراكز مع الخطة المنهجية",
      "تنفيذ قوانين المراكز التعليمية",
      "استخدام خامات البيئة بما يثري المراكز",
      "تنفيذ لوحة شعار الوحدة التعليمية",
      "تنفيذ لوحة خطة المفاهيم الأسبوعية للوحدة التعليمية",
      "تخصيص لوحة لعرض أعمال الأطفال",
      "التمكن من المادة العلمية والقدرة على تحقيق أهدافها",
      "التمهيد للنشاط بشكل جذاب ومناسب",
      "الاهتمام بإثراء المراكز التعليمية بالمواد والأدوات اللازمة",
      "الاهتمام بتفعيل ملف إنجاز المعلمة",
    ],
  },
  {
    key: "class-teacher-weekly",
    id: "kg-principal-class-teacher-weekly-evaluation-v1",
    title: "تقييم مديرة الروضة لمعلمات الصف - المتابعة الأسبوعية",
    targetSlot: "classTeachers",
    roleLabel: "معلمة الصف",
    planKind: "WEEKLY",
    frameworkKind: "WEEKLY_TEACHER_EVALUATION",
    cycles: WEEKLY,
    items: [
      "سجل الواجبات",
      "الكتاب المدرسي",
      "متابعة الحروف",
      "متابعة الأرقام",
      "متابعة القرآن",
      "اكتمال التحضير وتوافقه مع المنهج",
      "الالتزام بالإشراف على الأطفال والمناوبات",
      "التواصل والتفاعل مع أولياء الأمور",
      "النشر الإعلامي للفعاليات وأخبار المدارس",
      "السلوك العام والقدوة الحسنة",
      "الالتزام بالزي الرسمي",
      "القيام بما يسند إليها من مهام",
      "المبادرة في تقبل وتنفيذ التوجيهات",
      "حسن التصرف مع الرؤساء والزملاء وأولياء الأمور",
      "متابعة التزام المعلمات بدخول الحصص",
    ],
  },
  {
    key: "class-teacher-diagnostic",
    id: "kg-principal-class-teacher-diagnostic-evaluation-v1",
    title: "تقييم مديرة الروضة لمعلمات الصف - الزيارة التشخيصية",
    targetSlot: "classTeachers",
    roleLabel: "معلمة الصف",
    planKind: "PERIODIC",
    frameworkKind: "CLASSROOM_VISIT",
    cycles: TWICE,
    items: [
      "تقدر المسؤولية وتلتزم بأخلاقيات المهنة والتعليمات التنظيمية",
      "إعداد الخطة اليومية أو الأسبوعية وفق الخطة الدراسية المقررة",
      "التمكن من المادة العلمية والقدرة على تحقيق أهدافها",
      "التمهيد للدرس بشكل جذاب ومناسب (صورة، قصة، سؤال)",
      "عرض الدرس بطريقة متسلسلة ومشوقة ومترابطة",
      "ربط الدرس الجديد بالدرس السابق وفق الأهداف وخبرات الطلاب",
      "تنويع الأسئلة ومشاركة الطلاب مع مراعاة الفروق الفردية",
      "استخدام استراتيجيات تعلم فعالة وتوظيف تقنيات التعلم",
      "الاهتمام بتفعيل ملف إنجاز المعلمة",
      "تهيئة بيئة الصف قبل بدء الدرس (التنظيم)",
      "تقييم تعلم المتعلمين ومتابعة تقدمهم بانتظام",
      "توظيف استراتيجيات تربوية في معالجة سلوك المتعلمين تدعم اكتساب القيم والمبادئ",
      "المهارة في إدارة الصف",
      "التفاعل مع أولياء الأمور",
      "الاهتمام بالتطور المهني والنمو المعرفي",
      "تحقيق أهداف الدرس",
      "إثراء الحصيلة اللغوية لدى الطلاب",
      "ختام وإغلاق الدرس بمراجعة النقاط الأساسية (نشاط عملي، أوراق عمل، تدريب جماعي)",
      "تحسين نتائج المتعلمين",
      "إشراك الأسرة في نتائج التقييم",
      "المهارة في متابعة حضور وغياب الطلاب وانضباطهم",
    ],
  },
];

function initAdmin() {
  if (admin.apps.length) return;
  const serviceAccountPath = path.resolve(process.cwd(), "service-account.json");
  const serviceAccount = require(serviceAccountPath);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId: serviceAccount.project_id });
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
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

async function readRequiredDoc(db, documentPath, label) {
  const snapshot = await db.doc(documentPath).get();
  assert(snapshot.exists, `${label} not found: ${documentPath}`);
  return snapshot;
}

async function loadActiveMemberships(db) {
  const users = await db.collection("users").get();
  const memberships = [];
  for (let index = 0; index < users.docs.length; index += 400) {
    const snapshots = await db.getAll(
      ...users.docs.slice(index, index + 400).map((user) => db.doc(`users/${user.id}/orgMemberships/${CONFIG.orgId}`)),
    );
    memberships.push(...snapshots.filter((document) => document.exists && isActive(document.data())));
  }
  return memberships;
}

async function loadPreflight(db) {
  const orgRoot = `orgs/${CONFIG.orgId}`;
  const memberships = await loadActiveMemberships(db);
  const runtimeSchools = [];

  for (const schoolConfig of CONFIG.schools) {
    const requestedEvaluator = schoolConfig.evaluator;
    const [authUser, user, person, membership, operations, schoolDocument] = await Promise.all([
      admin.auth().getUser(requestedEvaluator.uid),
      readRequiredDoc(db, `users/${requestedEvaluator.uid}`, "Evaluator user"),
      readRequiredDoc(db, `${orgRoot}/people/${requestedEvaluator.personId}`, "Evaluator person"),
      readRequiredDoc(db, `users/${requestedEvaluator.uid}/orgMemberships/${CONFIG.orgId}`, "Evaluator membership"),
      db.collection(`${orgRoot}/operationalAssignments`).where("actorPersonId", "==", requestedEvaluator.personId).get(),
      readRequiredDoc(db, `${orgRoot}/schools/${schoolConfig.id}`, "School"),
    ]);
    const evaluatorMembership = membership.data();
    assert(normalizeEmail(authUser.email) === requestedEvaluator.email, `${schoolConfig.id} evaluator auth email mismatch.`);
    assert(normalizeEmail(user.data().email || person.data().email) === requestedEvaluator.email, `${schoolConfig.id} evaluator user email mismatch.`);
    assert(asString(evaluatorMembership.personId) === requestedEvaluator.personId, `${schoolConfig.id} evaluator personId mismatch.`);
    assert(asString(evaluatorMembership.roleKey || evaluatorMembership.role).toUpperCase() === "KG_PRINCIPAL", `${schoolConfig.id} evaluator role mismatch.`);
    assert(isActive(evaluatorMembership) && membershipCoversSchool(evaluatorMembership, schoolConfig.id), `${schoolConfig.id} evaluator scope mismatch.`);
    assert(evaluatorMembership.permissions?.manageEvaluations === true, `${schoolConfig.id} evaluator is missing manageEvaluations.`);
    assert(asString(person.data().displayName) === requestedEvaluator.displayName, `${schoolConfig.id} evaluator displayName mismatch.`);
    assert(asString(schoolDocument.data().name || schoolDocument.data().title) === schoolConfig.label, `${schoolConfig.id} label mismatch.`);
    assert(operations.docs.some((document) => {
      const data = document.data();
      return isActive(data) && asString(data.operationKind) === "STAFF_EVALUATION" &&
        asString(data.schoolId || data.scopeId) === schoolConfig.id;
    }), `${schoolConfig.id} evaluator is missing STAFF_EVALUATION.`);

    const teacherMemberships = memberships.filter((teacherMembership) => {
      const data = teacherMembership.data();
      return asString(data.roleKey || data.role).toUpperCase() === "KG_TEACHER" &&
        membershipCoversSchool(data, schoolConfig.id);
    });
    assert(teacherMemberships.length === schoolConfig.expectedTeacherCount, `${schoolConfig.id} teacher count mismatch: expected ${schoolConfig.expectedTeacherCount}, found ${teacherMemberships.length}.`);
    const teacherPeople = await db.getAll(...teacherMemberships.map((teacherMembership) =>
      db.doc(`${orgRoot}/people/${asString(teacherMembership.data().personId)}`),
    ));
    const peopleById = new Map(teacherPeople.filter((teacherPerson) => teacherPerson.exists).map((teacherPerson) => [teacherPerson.id, teacherPerson.data()]));
    const teachers = teacherMemberships.map((teacherMembership) => {
      const membershipData = teacherMembership.data();
      const personId = asString(membershipData.personId);
      const teacherPerson = peopleById.get(personId);
      assert(teacherPerson, `${schoolConfig.id} teacher person missing: ${personId}`);
      return {
        uid: teacherMembership.ref.parent.parent?.id || "",
        personId,
        displayName: asString(teacherPerson.displayName || membershipData.displayName),
        email: normalizeEmail(teacherPerson.email || membershipData.email),
        roleKey: "KG_TEACHER",
      };
    }).sort((left, right) => left.displayName.localeCompare(right.displayName, "ar"));

    const authResult = await admin.auth().getUsers(teachers.map((requestedTeacher) => ({ uid: requestedTeacher.uid })));
    assert(authResult.notFound.length === 0 && authResult.users.length === teachers.length, `${schoolConfig.id} teacher auth validation failed.`);
    const authEmails = new Map(authResult.users.map((authTeacher) => [authTeacher.uid, normalizeEmail(authTeacher.email)]));
    assert(teachers.every((requestedTeacher) => authEmails.get(requestedTeacher.uid) === requestedTeacher.email), `${schoolConfig.id} teacher auth email mismatch.`);

    for (const specialTeacher of [schoolConfig.valuesTeacher, schoolConfig.cornersTeacher]) {
      const match = teachers.find((requestedTeacher) => requestedTeacher.personId === specialTeacher.personId);
      assert(match, `${schoolConfig.id} special teacher missing: ${specialTeacher.personId}`);
      assert(match.uid === specialTeacher.uid && match.displayName === specialTeacher.displayName && match.email === specialTeacher.email, `${schoolConfig.id} special teacher identity mismatch: ${specialTeacher.personId}`);
    }

    const excludedPersonIds = new Set([schoolConfig.valuesTeacher.personId, schoolConfig.cornersTeacher.personId]);
    const classTeachers = teachers.filter((requestedTeacher) => !excludedPersonIds.has(requestedTeacher.personId));
    assert(classTeachers.length === schoolConfig.expectedTeacherCount - excludedPersonIds.size, `${schoolConfig.id} class teacher count mismatch.`);
    runtimeSchools.push({
      ...schoolConfig,
      targets: {
        valuesTeachers: [teachers.find((requestedTeacher) => requestedTeacher.personId === schoolConfig.valuesTeacher.personId)],
        cornersTeachers: [teachers.find((requestedTeacher) => requestedTeacher.personId === schoolConfig.cornersTeacher.personId)],
        classTeachers,
      },
    });
  }

  return { orgRoot, schools: runtimeSchools };
}

function buildFrameworkDocuments(orgRoot) {
  const documents = [];
  for (const framework of FRAMEWORKS) {
    const sectionId = `${framework.id}-main`;
    documents.push({ type: "framework", path: `${orgRoot}/evaluationFrameworks/${framework.id}`, data: {
      id: framework.id, orgId: CONFIG.orgId, title: framework.title, description: `قالب رسمي لـ${framework.title}.`,
      targetKind: "TEACHER", targetRoleLabel: framework.roleLabel, targetRoleKeyHint: "KG_TEACHER",
      evaluatorKind: "SCHOOL_PRINCIPAL", evaluatorLabel: "مديرة الروضة", defaultEvaluatorRoleKeys: ["KG_PRINCIPAL"],
      frameworkKind: framework.frameworkKind, schoolTypes: ["KG"], maxCyclesPerTerm: framework.cycles.length,
      defaultItemMaxScore: 5, isActive: true, isLocked: true, version: 1,
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
  }
  return documents;
}

function buildPlanDocuments(orgRoot, schools) {
  const documents = [];
  for (const schoolConfig of schools) {
    for (const framework of FRAMEWORKS) {
      const targets = schoolConfig.targets[framework.targetSlot];
      const planId = `${schoolConfig.id}-${CONFIG.academicYearId}-${CONFIG.termId}-${framework.key}-evaluation`;
      documents.push({ type: "plan", planId, path: `${orgRoot}/evaluationPlans/${planId}`, data: {
        id: planId, orgId: CONFIG.orgId, schoolId: schoolConfig.id, academicYearId: CONFIG.academicYearId,
        termId: CONFIG.termId, title: `${framework.title} - ${schoolConfig.label} - الفصل الأول`,
        description: `خطة تطبيق ${framework.title} داخل الفصل الدراسي الأول.`, frameworkId: framework.id,
        planKind: framework.planKind, targetKind: "TEACHER", targetRoleKey: "KG_TEACHER",
        targetRoleLabel: framework.roleLabel, status: "ACTIVE",
      }});
      const policyId = `${planId}-policy-principal`;
      documents.push({ type: "policy", planId, path: `${orgRoot}/evaluatorPolicies/${policyId}`, data: {
        id: policyId, orgId: CONFIG.orgId, schoolId: schoolConfig.id, academicYearId: CONFIG.academicYearId,
        termId: CONFIG.termId, planId, evaluatorRoleKey: "KG_PRINCIPAL", evaluatorLabel: "مديرة الروضة",
        evaluatorPersonId: schoolConfig.evaluator.personId, weight: 100, required: true, canSubmit: true,
        canReview: false, canApprove: true, order: 1,
      }});
      for (const cycle of framework.cycles) {
        const cycleId = `${planId}-${cycle.suffix}`;
        documents.push({ type: "cycle", planId, path: `${orgRoot}/evaluationCycles/${cycleId}`, data: {
          id: cycleId, orgId: CONFIG.orgId, schoolId: schoolConfig.id, academicYearId: CONFIG.academicYearId,
          termId: CONFIG.termId, planId, cycleNumber: cycle.number, title: cycle.title, cycleKind: cycle.kind,
          status: "OPEN", isIncludedInAverage: true,
        }});
      }
      for (const requestedTarget of targets) {
        const targetAssignmentId = `${planId}-target-${requestedTarget.personId}`;
        documents.push({ type: "targetAssignment", planId, path: `${orgRoot}/evaluationTargetAssignments/${targetAssignmentId}`, data: {
          id: targetAssignmentId, orgId: CONFIG.orgId, schoolId: schoolConfig.id,
          academicYearId: CONFIG.academicYearId, termId: CONFIG.termId, planId,
          targetPersonId: requestedTarget.personId, targetEmail: requestedTarget.email,
          targetDisplayName: requestedTarget.displayName, targetRoleKey: "KG_TEACHER",
          targetRoleLabel: framework.roleLabel, targetKind: "TEACHER", status: "ACTIVE",
        }});
        for (const cycle of framework.cycles) {
          const cycleId = `${planId}-${cycle.suffix}`;
          const assignmentId = `${cycleId}-${requestedTarget.personId}-${schoolConfig.evaluator.personId}`;
          documents.push({ type: "evaluatorAssignment", planId, path: `${orgRoot}/evaluationEvaluatorAssignments/${assignmentId}`, data: {
            id: assignmentId, orgId: CONFIG.orgId, schoolId: schoolConfig.id,
            academicYearId: CONFIG.academicYearId, termId: CONFIG.termId, planId, cycleId,
            targetPersonId: requestedTarget.personId, targetRoleKey: "KG_TEACHER", targetRoleLabel: framework.roleLabel,
            evaluatorPersonId: schoolConfig.evaluator.personId, evaluatorEmail: schoolConfig.evaluator.email,
            evaluatorRoleKey: "KG_PRINCIPAL", weight: 100, sourceType: "MANUAL", status: "ACTIVE",
          }});
        }
      }
    }
  }
  return documents;
}

function assertStructure(documents, schools) {
  for (const framework of FRAMEWORKS) {
    const sections = documents.filter((document) => document.type === "section" && document.data.frameworkId === framework.id);
    const items = documents.filter((document) => document.type === "item" && document.data.frameworkId === framework.id);
    assert(sections.length === 1 && sections[0].data.weight === 100, `${framework.id} section validation failed.`);
    assert(items.length === framework.items.length, `${framework.id} item count mismatch.`);
    assert(new Set(framework.items).size === framework.items.length, `${framework.id} contains duplicate items.`);
    assert(items.every((item, index) => item.data.order === index + 1 && item.data.maxScore === 5), `${framework.id} item validation failed.`);
  }
  for (const schoolConfig of schools) {
    for (const framework of FRAMEWORKS) {
      const targetCount = schoolConfig.targets[framework.targetSlot].length;
      const planId = `${schoolConfig.id}-${CONFIG.academicYearId}-${CONFIG.termId}-${framework.key}-evaluation`;
      const planDocuments = documents.filter((document) => document.planId === planId);
      assert(planDocuments.filter((document) => document.type === "cycle").length === framework.cycles.length, `${planId} cycle count mismatch.`);
      assert(planDocuments.filter((document) => document.type === "targetAssignment").length === targetCount, `${planId} target count mismatch.`);
      assert(planDocuments.filter((document) => document.type === "evaluatorAssignment").length === targetCount * framework.cycles.length, `${planId} evaluator count mismatch.`);
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
      else { assertExistingDocument(snapshot, desired); existing.push(desired); }
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
        ...document.data, createdAt: now, updatedAt: now,
        ...(document.type === "framework" ? { lockedAt: now } : {}),
        ...(document.type === "targetAssignment" ? { assignedAt: now } : {}),
      });
    }
    await batch.commit();
  }
}

async function verifyPlanCounts(db, orgRoot, schools) {
  for (const schoolConfig of schools) {
    for (const framework of FRAMEWORKS) {
      const targetCount = schoolConfig.targets[framework.targetSlot].length;
      const planId = `${schoolConfig.id}-${CONFIG.academicYearId}-${CONFIG.termId}-${framework.key}-evaluation`;
      const [cycles, targets, assignments] = await Promise.all([
        db.collection(`${orgRoot}/evaluationCycles`).where("planId", "==", planId).get(),
        db.collection(`${orgRoot}/evaluationTargetAssignments`).where("planId", "==", planId).get(),
        db.collection(`${orgRoot}/evaluationEvaluatorAssignments`).where("planId", "==", planId).get(),
      ]);
      assert(cycles.docs.filter((document) => isActive(document.data())).length === framework.cycles.length, `${planId} active cycle verification failed.`);
      assert(targets.docs.filter((document) => isActive(document.data())).length === targetCount, `${planId} active target verification failed.`);
      assert(assignments.docs.filter((document) => isActive(document.data())).length === targetCount * framework.cycles.length, `${planId} active evaluator verification failed.`);
    }
  }
}

function buildReport(documents, inspection, schools) {
  return {
    schools: schools.map((schoolConfig) => ({
      id: schoolConfig.id,
      evaluator: schoolConfig.evaluator.displayName,
      valuesTeacher: schoolConfig.targets.valuesTeachers[0].displayName,
      cornersTeacher: schoolConfig.targets.cornersTeachers[0].displayName,
      classTeacherCount: schoolConfig.targets.classTeachers.length,
    })),
    frameworks: FRAMEWORKS.map((framework) => ({
      id: framework.id, roleLabel: framework.roleLabel, cycles: framework.cycles.length, items: framework.items.length,
    })),
    desired: countByType(documents), existing: countByType(inspection.existing),
    missing: countByType(inspection.missing), total: documents.length,
  };
}

async function main() {
  initAdmin();
  const db = admin.firestore();
  const { orgRoot, schools } = await loadPreflight(db);
  const documents = [...buildFrameworkDocuments(orgRoot), ...buildPlanDocuments(orgRoot, schools)];
  assertStructure(documents, schools);
  const inspection = await inspectDocuments(db, documents);
  console.log(APPLY ? "Apply mode" : "Preview mode (read-only)");
  console.dir(buildReport(documents, inspection, schools), { depth: 10 });
  if (!APPLY) {
    console.log("No writes performed. Re-run with --apply to create missing documents.");
    return;
  }
  if (inspection.missing.length > 0) await applyMissingDocuments(db, inspection.missing);
  const verification = await inspectDocuments(db, documents);
  assert(verification.missing.length === 0, "Documents are still missing after apply.");
  await verifyPlanCounts(db, orgRoot, schools);
  console.log("Kindergarten principal teacher evaluations applied and verified.");
  console.dir({ verified: countByType(documents), total: documents.length });
}

main().catch((error) => {
  console.error("Kindergarten principal teacher evaluation seed failed:");
  console.error(error);
  process.exitCode = 1;
});
