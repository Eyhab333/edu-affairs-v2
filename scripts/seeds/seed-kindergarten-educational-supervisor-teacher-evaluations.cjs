/* eslint-disable no-console */

const admin = require("firebase-admin");
const path = require("path");

const APPLY = process.argv.includes("--apply");

const CONFIG = {
  orgId: "takween",
  academicYearId: "ay-1448",
  termId: "term-1",
  evaluator: {
    uid: "H9nDRWMOqsfOUE27cJBbJn2RESE3",
    personId: "p-f-alhamaad",
    displayName: "فاطمة حماد الحماد",
    email: "f-alhamaad@qz.org.sa",
    roleKey: "EDU_SUPERVISOR",
    roleLabel: "المشرفة التعليمية",
  },
  schools: [
    school("kg-01", "روضة واحة الرياحين الأولى", special("p-ma-alfarhod", "منى احمد محمد الفرهود", "ma.alfarhod@qz.org.sa"), special("p-h-alarajh", "حصة عيسى حمد العراجة", "h.alarajh@qz.org.sa"), 13),
    school("kg-02", "روضة واحة الرياحين الثانية", special("p-r-albatel", "رهام سويد محمد الباتل", "r.albatel@qz.org.sa"), special("p-h-almadallah", "حصه عبدالعزيز محمد المدالله", "h.almadallah@qz.org.sa"), 13),
    school("kg-03", "روضة واحة الرياحين الثالثة", special("p-ss-alfaleh", "سارة سعود محمد الفالح", "ss.alfaleh@qz.org.sa"), special("p-r-alfayez", "رغده سليمان محمد الفايز", "r.alfayez@qz.org.sa"), 11),
    school("kg-04", "روضة واحة الرياحين الرابعة", special("p-s-bader", "ساره عبدالله علي البدر", "s.bader@qz.org.sa"), special("p-s-bader", "ساره عبدالله علي البدر", "s.bader@qz.org.sa"), 7),
  ],
};

function special(personId, displayName, email) {
  return { personId, displayName, email };
}

function school(id, label, valuesTeacher, cornersTeacher, expectedTeacherCount) {
  return { id, label, valuesTeacher, cornersTeacher, expectedTeacherCount };
}

const PERIODIC_CYCLES = [
  { number: 1, title: "التقييم الأول", suffix: "evaluation-01", kind: "PERIOD" },
  { number: 2, title: "التقييم الثاني", suffix: "evaluation-02", kind: "PERIOD" },
];

const DIAGNOSTIC_CYCLES = [
  { number: 1, title: "الزيارة التشخيصية الأولى", suffix: "visit-01", kind: "VISIT" },
  { number: 2, title: "الزيارة التشخيصية الثانية", suffix: "visit-02", kind: "VISIT" },
];

const FRAMEWORKS = [
  {
    key: "values-teacher-periodic",
    id: "kg-educational-supervisor-values-teacher-periodic-evaluation-v1",
    title: "تقييم المشرفة التعليمية لمعلمة القيم",
    targetSlot: "valuesTeachers",
    roleLabel: "معلمة القيم",
    planKind: "PERIODIC",
    frameworkKind: "PERIODIC_STAFF_EVALUATION",
    cycles: PERIODIC_CYCLES,
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
    key: "values-teacher-diagnostic",
    id: "kg-educational-supervisor-values-teacher-diagnostic-evaluation-v1",
    title: "الزيارة التشخيصية لمعلمة القيم بواسطة المشرفة التعليمية",
    targetSlot: "valuesTeachers",
    roleLabel: "معلمة القيم",
    planKind: "VISIT_BASED",
    frameworkKind: "CLASSROOM_VISIT",
    cycles: DIAGNOSTIC_CYCLES,
    items: [
      "تقدر المسؤولية وتلتزم بأخلاقيات المهنة والتعليمات التنظيمية",
      "التمكن من المادة العلمية والقدرة على تحقيق أهدافها",
      "التمهيد للدرس بشكل جذاب ومناسب (صورة، قصة، سؤال)",
      "عرض الدرس بطريقة متسلسلة ومشوقة ومترابطة",
      "ربط الدرس الجديد بالدرس السابق وفق الأهداف وخبرات الطلاب",
      "إثارة تفكير الأطفال من خلال الأسئلة والمناقشة",
      "ربط القيم بخبرات الأطفال وبيئتهم",
      "استخدام استراتيجيات تعلم فعالة وتوظيف تقنيات التعلم",
      "تهيئة بيئة الصف قبل بدء الدرس (التنظيم)",
      "توظيف استراتيجيات تربوية في معالجة سلوك المتعلمين تدعم اكتساب القيم والمبادئ",
      "المهارة في إدارة الصف",
      "الاهتمام بالتطور المهني والنمو المعرفي",
      "تحقيق أهداف الوحدة",
      "إثراء الحصيلة اللغوية لدى الطلاب",
      "تفعيل التقرير الختامي لكل وحدة",
      "تنويع الأسئلة ومشاركة الطلاب مع مراعاة الفروق الفردية",
      "الاهتمام بتفعيل ملف إنجاز المعلمة",
      "متابعة الطفل في تطبيق القيم من الجانب العقدي والأخلاقي",
      "تقويم تعلم المتعلمين ومتابعة تقدمهم بانتظام",
    ],
  },
  {
    key: "corners-teacher-periodic",
    id: "kg-educational-supervisor-corners-teacher-periodic-evaluation-v1",
    title: "تقييم المشرفة التعليمية لمعلمة الأركان",
    targetSlot: "cornersTeachers",
    roleLabel: "معلمة الأركان",
    planKind: "PERIODIC",
    frameworkKind: "PERIODIC_STAFF_EVALUATION",
    cycles: PERIODIC_CYCLES,
    items: [
      "متابعة تنفيذ أوراق العمل",
      "تفعيل ملف إنجاز الأطفال",
      "تنفيذ الأنشطة المدرسية واللاصفية والمبادرات",
      "تفعيل استمارة تقييم الأطفال",
      "اكتمال التحضير وتوافقه مع توزيع المنهج",
      "الالتزام بالزي الرسمي",
      "المبادرة في تقبل وتنفيذ التوجيهات",
      "المساهمة في تدريب الزملاء تقنيًا",
      "تفعيل الزيارات المتبادلة",
      "تفعيل مجتمعات التعلم المهنية",
    ],
  },
  {
    key: "corners-teacher-diagnostic",
    id: "kg-educational-supervisor-corners-teacher-diagnostic-evaluation-v1",
    title: "الزيارة التشخيصية لمعلمة الأركان بواسطة المشرفة التعليمية",
    targetSlot: "cornersTeachers",
    roleLabel: "معلمة الأركان",
    planKind: "VISIT_BASED",
    frameworkKind: "CLASSROOM_VISIT",
    cycles: DIAGNOSTIC_CYCLES,
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
    key: "class-teacher-periodic",
    id: "kg-educational-supervisor-class-teacher-periodic-evaluation-v1",
    title: "تقييم المشرفة التعليمية لمعلمات الصف",
    targetSlot: "classTeachers",
    roleLabel: "معلمة الصف",
    planKind: "PERIODIC",
    frameworkKind: "PERIODIC_STAFF_EVALUATION",
    cycles: PERIODIC_CYCLES,
    items: [
      "متابعة الكتاب المدرسي",
      "متابعة سجل الواجبات",
      "متابعة تنفيذ أوراق العمل",
      "متابعة تنفيذ الفاقد التعليمي",
      "اكتمال بنود التحضير",
      "متابعة تنفيذ المجتمعات المهنية",
      "المبادرة في تقبل وتنفيذ التوجيهات",
      "تنفيذ الأنشطة المدرسية واللاصفية والمبادرات",
      "الالتزام بالزي الرسمي",
      "تفعيل الزيارات المتبادلة",
      "المساهمة في تدريب الزميلات تقنيًا",
    ],
  },
  {
    key: "class-teacher-diagnostic",
    id: "kg-educational-supervisor-class-teacher-diagnostic-evaluation-v1",
    title: "الزيارة التشخيصية لمعلمات الصف بواسطة المشرفة التعليمية",
    targetSlot: "classTeachers",
    roleLabel: "معلمة الصف",
    planKind: "VISIT_BASED",
    frameworkKind: "CLASSROOM_VISIT",
    cycles: DIAGNOSTIC_CYCLES,
    items: [
      "تقدر المسؤولية وتلتزم بأخلاقيات المهنة والتعليمات التنظيمية",
      "الخطة اليومية أو الأسبوعية وفق الخطة الدراسية المقررة",
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
  const evaluator = CONFIG.evaluator;
  const [authUser, user, person, membership, operations, memberships] = await Promise.all([
    admin.auth().getUser(evaluator.uid),
    readRequiredDoc(db, `users/${evaluator.uid}`, "Evaluator user"),
    readRequiredDoc(db, `${orgRoot}/people/${evaluator.personId}`, "Evaluator person"),
    readRequiredDoc(db, `users/${evaluator.uid}/orgMemberships/${CONFIG.orgId}`, "Evaluator membership"),
    db.collection(`${orgRoot}/operationalAssignments`).where("actorPersonId", "==", evaluator.personId).get(),
    loadActiveMemberships(db),
  ]);
  const evaluatorMembership = membership.data();
  assert(normalizeEmail(authUser.email) === evaluator.email, "Evaluator auth email mismatch.");
  assert(normalizeEmail(user.data().email || person.data().email) === evaluator.email, "Evaluator user email mismatch.");
  assert(asString(evaluatorMembership.personId) === evaluator.personId, "Evaluator personId mismatch.");
  assert(asString(evaluatorMembership.roleKey || evaluatorMembership.role).toUpperCase() === evaluator.roleKey, "Evaluator role mismatch.");
  assert(isActive(evaluatorMembership) && evaluatorMembership.permissions?.manageEvaluations === true, "Evaluator membership/permission mismatch.");
  assert(asString(person.data().displayName) === evaluator.displayName, "Evaluator displayName mismatch.");

  const runtimeSchools = [];
  for (const schoolConfig of CONFIG.schools) {
    const schoolDocument = await readRequiredDoc(db, `${orgRoot}/schools/${schoolConfig.id}`, "School");
    assert(asString(schoolDocument.data().name || schoolDocument.data().title) === schoolConfig.label, `${schoolConfig.id} label mismatch.`);
    assert(membershipCoversSchool(evaluatorMembership, schoolConfig.id), `Evaluator is missing ${schoolConfig.id} scope.`);
    assert(operations.docs.some((document) => {
      const data = document.data();
      return isActive(data) && asString(data.operationKind) === "STAFF_EVALUATION" &&
        asString(data.schoolId || data.scopeId) === schoolConfig.id;
    }), `Evaluator is missing STAFF_EVALUATION for ${schoolConfig.id}.`);

    const teacherMemberships = memberships.filter((teacherMembership) => {
      const data = teacherMembership.data();
      return asString(data.roleKey || data.role).toUpperCase() === "KG_TEACHER" && membershipCoversSchool(data, schoolConfig.id);
    });
    assert(teacherMemberships.length === schoolConfig.expectedTeacherCount, `${schoolConfig.id} teacher count mismatch.`);
    const people = await db.getAll(...teacherMemberships.map((teacherMembership) =>
      db.doc(`${orgRoot}/people/${asString(teacherMembership.data().personId)}`),
    ));
    const peopleById = new Map(people.filter((teacherPerson) => teacherPerson.exists).map((teacherPerson) => [teacherPerson.id, teacherPerson.data()]));
    const teachers = teacherMemberships.map((teacherMembership) => {
      const personId = asString(teacherMembership.data().personId);
      const teacherPerson = peopleById.get(personId);
      assert(teacherPerson, `${schoolConfig.id} teacher person missing: ${personId}`);
      return {
        personId,
        displayName: asString(teacherPerson.displayName || teacherMembership.data().displayName),
        email: normalizeEmail(teacherPerson.email || teacherMembership.data().email),
      };
    }).sort((left, right) => left.displayName.localeCompare(right.displayName, "ar"));

    for (const specialTeacher of [schoolConfig.valuesTeacher, schoolConfig.cornersTeacher]) {
      const match = teachers.find((requestedTeacher) => requestedTeacher.personId === specialTeacher.personId);
      assert(match && match.displayName === specialTeacher.displayName && match.email === specialTeacher.email, `${schoolConfig.id} special teacher mismatch: ${specialTeacher.personId}`);
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
      evaluatorKind: "EDUCATIONAL_SUPERVISOR", evaluatorLabel: CONFIG.evaluator.roleLabel,
      defaultEvaluatorRoleKeys: [CONFIG.evaluator.roleKey], frameworkKind: framework.frameworkKind,
      schoolTypes: ["KG"], maxCyclesPerTerm: framework.cycles.length, defaultItemMaxScore: 5,
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
  }
  return documents;
}

function buildPlanDocuments(orgRoot, schools) {
  const documents = [];
  for (const schoolConfig of schools) {
    for (const framework of FRAMEWORKS) {
      const targets = schoolConfig.targets[framework.targetSlot];
      const planId = `${schoolConfig.id}-${CONFIG.academicYearId}-${CONFIG.termId}-educational-supervisor-${framework.key}-evaluation`;
      documents.push({ type: "plan", planId, path: `${orgRoot}/evaluationPlans/${planId}`, data: {
        id: planId, orgId: CONFIG.orgId, schoolId: schoolConfig.id, academicYearId: CONFIG.academicYearId,
        termId: CONFIG.termId, title: `${framework.title} - ${schoolConfig.label} - الفصل الأول`,
        description: `خطة تطبيق ${framework.title} داخل الفصل الدراسي الأول.`, frameworkId: framework.id,
        planKind: framework.planKind, targetKind: "TEACHER", targetRoleKey: "KG_TEACHER",
        targetRoleLabel: framework.roleLabel, status: "ACTIVE",
      }});
      const policyId = `${planId}-policy-${CONFIG.evaluator.personId}`;
      documents.push({ type: "policy", planId, path: `${orgRoot}/evaluatorPolicies/${policyId}`, data: {
        id: policyId, orgId: CONFIG.orgId, schoolId: schoolConfig.id, academicYearId: CONFIG.academicYearId,
        termId: CONFIG.termId, planId, evaluatorRoleKey: CONFIG.evaluator.roleKey,
        evaluatorLabel: CONFIG.evaluator.roleLabel, evaluatorPersonId: CONFIG.evaluator.personId,
        weight: 100, required: true, canSubmit: true, canReview: false, canApprove: true, order: 1,
      }});
      for (const cycle of framework.cycles) {
        const cycleId = `${planId}-${cycle.suffix}`;
        documents.push({ type: "cycle", planId, path: `${orgRoot}/evaluationCycles/${cycleId}`, data: {
          id: cycleId, orgId: CONFIG.orgId, schoolId: schoolConfig.id, academicYearId: CONFIG.academicYearId,
          termId: CONFIG.termId, planId, cycleNumber: cycle.number, title: cycle.title,
          cycleKind: cycle.kind, status: "OPEN", isIncludedInAverage: true,
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
          const assignmentId = `${cycleId}-${requestedTarget.personId}-${CONFIG.evaluator.personId}`;
          documents.push({ type: "evaluatorAssignment", planId, path: `${orgRoot}/evaluationEvaluatorAssignments/${assignmentId}`, data: {
            id: assignmentId, orgId: CONFIG.orgId, schoolId: schoolConfig.id,
            academicYearId: CONFIG.academicYearId, termId: CONFIG.termId, planId, cycleId,
            targetPersonId: requestedTarget.personId, targetRoleKey: "KG_TEACHER", targetRoleLabel: framework.roleLabel,
            evaluatorPersonId: CONFIG.evaluator.personId, evaluatorEmail: CONFIG.evaluator.email,
            evaluatorRoleKey: CONFIG.evaluator.roleKey, weight: 100, sourceType: "MANUAL", status: "ACTIVE",
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
    assert(items.length === framework.items.length && new Set(framework.items).size === framework.items.length, `${framework.id} item count/duplicates mismatch.`);
    assert(items.every((item, index) => item.data.order === index + 1 && item.data.maxScore === 5), `${framework.id} item validation failed.`);
  }
  for (const schoolConfig of schools) {
    for (const framework of FRAMEWORKS) {
      const targetCount = schoolConfig.targets[framework.targetSlot].length;
      const planId = `${schoolConfig.id}-${CONFIG.academicYearId}-${CONFIG.termId}-educational-supervisor-${framework.key}-evaluation`;
      const planDocuments = documents.filter((document) => document.planId === planId);
      assert(planDocuments.filter((document) => document.type === "cycle").length === 2, `${planId} cycle count mismatch.`);
      assert(planDocuments.filter((document) => document.type === "targetAssignment").length === targetCount, `${planId} target count mismatch.`);
      assert(planDocuments.filter((document) => document.type === "evaluatorAssignment").length === targetCount * 2, `${planId} evaluator count mismatch.`);
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
      const planId = `${schoolConfig.id}-${CONFIG.academicYearId}-${CONFIG.termId}-educational-supervisor-${framework.key}-evaluation`;
      const [cycles, targets, assignments] = await Promise.all([
        db.collection(`${orgRoot}/evaluationCycles`).where("planId", "==", planId).get(),
        db.collection(`${orgRoot}/evaluationTargetAssignments`).where("planId", "==", planId).get(),
        db.collection(`${orgRoot}/evaluationEvaluatorAssignments`).where("planId", "==", planId).get(),
      ]);
      assert(cycles.docs.filter((document) => isActive(document.data())).length === 2, `${planId} active cycle verification failed.`);
      assert(targets.docs.filter((document) => isActive(document.data())).length === targetCount, `${planId} active target verification failed.`);
      assert(assignments.docs.filter((document) => isActive(document.data())).length === targetCount * 2, `${planId} active evaluator verification failed.`);
    }
  }
}

function buildReport(documents, inspection, schools) {
  return {
    evaluator: CONFIG.evaluator,
    schools: schools.map((schoolConfig) => ({
      id: schoolConfig.id,
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
  console.log("Kindergarten educational supervisor teacher evaluations applied and verified.");
  console.dir({ verified: countByType(documents), total: documents.length });
}

main().catch((error) => {
  console.error("Kindergarten educational supervisor teacher evaluation seed failed:");
  console.error(error);
  process.exitCode = 1;
});
