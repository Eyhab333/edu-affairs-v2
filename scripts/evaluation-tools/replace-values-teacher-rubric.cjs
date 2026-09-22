const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

const serviceAccount = require(path.resolve("service-account.json"));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });
}

const db = admin.firestore();

const APPLY = process.argv.includes("--apply");

const ORG_ID = "takween";

const FRAMEWORK_ID =
  "kg-values-coordinator-values-teacher-periodic-evaluation-v1";

const REPORTS_DIR = path.resolve(
  "scripts/evaluation-tools/reports",
);

const NEW_RUBRIC = [
  {
    title: "التأصيل الشرعي",
    items: [
      "صحة المعلومات والمعاني الشرعية.",
      "صحة معنى اسم الله المقدم.",
      "صحة الربط بين اسم الله والقيمة.",
      "تبسيط المعنى بما يناسب عمر الطفل.",
    ],
  },
  {
    title: "التحضير والتخطيط",
    items: [
      "وجود تحضير مكتوب وشامل العناصر.",
      "تحديد ناتج تعلم واضح وقابل للقياس.",
      "تجهيز الوسائل والأدوات مسبقًا.",
    ],
  },
  {
    title: "تسلسل الدرس",
    items: [
      "مقدمة مناسبة.",
      "مراجعة الدرس السابق ومناقشة الأطفال.",
      "تمهيد مشوق للدرس.",
      "تقديم الدرس الأساسي بوضوح وتسلسل.",
      "قياس بعدي للتحقق من التعلم.",
      "خاتمة تلخص المعنى الرئيس.",
    ],
  },
  {
    title: "الاستراتيجيات التعليمية",
    items: [
      "استخدام استراتيجية محسوسة.",
      "استخدام استراتيجية لفظية وحوارية.",
      "تنويع أساليب عرض المعلومة.",
      "مناسبة الاستراتيجيات لأطفال الروضة.",
    ],
  },
  {
    title: "إدارة الصف وضبط الأطفال",
    items: [
      "ضبط الأطفال وإدارة سلوكهم.",
      "جذب الانتباه والمحافظة عليه.",
      "تنظيم الانتقال بين فقرات الدرس.",
      "استثمار وقت الحصة بفاعلية.",
    ],
  },
  {
    title: "تفاعل الأطفال",
    items: [
      "إشراك الأطفال في الحوار.",
      "تنويع الأسئلة الموجهة لهم.",
      "إتاحة الفرصة للأطفال للتعبير والإجابة.",
      "ملاحظة استجابة الأطفال وفهمهم.",
    ],
  },
  {
    title: "تطبيق القيمة",
    items: [
      "وجود تطبيق عملي واضح للقيمة.",
      "ربط القيمة بمواقف من حياة الطفل.",
      "توضيح السلوك المتوقع من الطفل.",
      "تشجيع الطفل على ممارسة القيمة خارج الصف.",
    ],
  },
  {
    title: "قياس ناتج التعلم",
    items: [
      "استخدام قياس بعدي مناسب.",
      "التحقق من فهم معنى اسم الله والقيمة.",
      "تحقق ناتج التعلم المحدد.",
      "ظهور أثر معرفي وإيماني وسلوكي لدى الطفل.",
    ],
  },
];

function asString(value, fallback = "") {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : fallback;
}

function asNumber(value, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : fallback;
}

function safeFileName(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9\u0600-\u06FF._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function getRows(orgRef, collectionName) {
  const snap = await orgRef.collection(collectionName).get();

  return snap.docs.map((doc) => ({
    id: doc.id,
    ref: doc.ref,
    ...doc.data(),
  }));
}

function cleanForCopy(row) {
  const copy = { ...row };

  delete copy.id;
  delete copy.ref;
  delete copy.frameworkId;
  delete copy.sectionId;
  delete copy.title;
  delete copy.label;
  delete copy.name;
  delete copy.order;
  delete copy.sequence;
  delete copy.createdAt;
  delete copy.updatedAt;

  return copy;
}

function writeReport(report) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });

  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-");

  const mode = APPLY ? "apply" : "preview";

  const reportPath = path.join(
    REPORTS_DIR,
    [
      timestamp,
      mode,
      "replace-values-teacher-rubric",
      safeFileName(FRAMEWORK_ID),
    ].join("__") + ".json",
  );

  fs.writeFileSync(
    reportPath,
    JSON.stringify(report, null, 2),
    "utf8",
  );

  return reportPath;
}

async function commitInChunks(operations, size = 400) {
  let committed = 0;

  for (let i = 0; i < operations.length; i += size) {
    const batch = db.batch();

    const chunk = operations.slice(i, i + size);

    for (const operation of chunk) {
      if (operation.type === "delete") {
        batch.delete(operation.ref);
      } else {
        batch.set(
          operation.ref,
          operation.data,
          { merge: false },
        );
      }
    }

    await batch.commit();

    committed += chunk.length;
  }

  return committed;
}

async function main() {
  console.log(
    APPLY
      ? "APPLY mode"
      : "Preview mode - no writes",
  );

  const orgRef = db.collection("orgs").doc(ORG_ID);

  const frameworkRef = orgRef
    .collection("evaluationFrameworks")
    .doc(FRAMEWORK_ID);

  const [
    frameworkSnap,
    sections,
    items,
    submissions,
  ] = await Promise.all([
    frameworkRef.get(),
    getRows(orgRef, "evaluationRubricSections"),
    getRows(orgRef, "evaluationRubricItems"),
    getRows(orgRef, "evaluationSubmissions"),
  ]);

  const conflicts = [];

  if (!frameworkSnap.exists) {
    conflicts.push({
      reason: "FRAMEWORK_NOT_FOUND",
      frameworkId: FRAMEWORK_ID,
    });
  }

  const oldSections = sections.filter(
    (row) =>
      asString(row.frameworkId) === FRAMEWORK_ID,
  );

  const oldItems = items.filter(
    (row) =>
      asString(row.frameworkId) === FRAMEWORK_ID,
  );

  /*
   * حماية إضافية:
   * حتى لو حصل استخدام للتقييم بعد آخر مراجعة،
   * السكربت يتوقف ولا يغير البنود.
   */
  const frameworkSubmissions = submissions.filter(
    (row) =>
      asString(row.frameworkId) === FRAMEWORK_ID,
  );

  if (frameworkSubmissions.length > 0) {
    conflicts.push({
      reason: "FRAMEWORK_HAS_SUBMISSIONS",
      submissionsCount: frameworkSubmissions.length,
      note:
        "لن يتم استبدال البنود لأن الـ framework أصبح مستخدمًا.",
    });
  }

  const newItemsCount = NEW_RUBRIC.reduce(
    (sum, section) => sum + section.items.length,
    0,
  );

  /*
   * نستخدم خصائص الـ scoring الموجودة حاليًا كـ pattern
   * حتى لا نفترض Schema جديدًا.
   */
  const sectionPattern = oldSections[0] || {};
  const itemPattern = oldItems[0] || {};

  const sectionBase = cleanForCopy(sectionPattern);
  const itemBase = cleanForCopy(itemPattern);

  const now = Date.now();

  const operations = [];

  /*
   * حذف الـ rubric القديم فقط.
   */
  for (const row of oldItems) {
    operations.push({
      type: "delete",
      ref: row.ref,
    });
  }

  for (const row of oldSections) {
    operations.push({
      type: "delete",
      ref: row.ref,
    });
  }

  const createdSections = [];
  const createdItems = [];

  NEW_RUBRIC.forEach((section, sectionIndex) => {
    const sectionNumber = sectionIndex + 1;

    const sectionId =
      `${FRAMEWORK_ID}-section-${String(sectionNumber).padStart(2, "0")}`;

    const sectionData = {
      ...sectionBase,

      id: sectionId,
      orgId: ORG_ID,
      frameworkId: FRAMEWORK_ID,

      title: section.title,
      order: sectionNumber,
      sequence: sectionNumber,

      createdAt: now,
      updatedAt: now,
    };

    /*
     * إذا كان النظام الحالي يستخدم section weight،
     * نقسم الـ 100 بالتساوي على المحاور الثمانية.
     */
    if (
      typeof sectionPattern.weight === "number"
    ) {
      sectionData.weight = 12.5;
    }

    operations.push({
      type: "set",
      ref: orgRef
        .collection("evaluationRubricSections")
        .doc(sectionId),
      data: sectionData,
    });

    createdSections.push({
      id: sectionId,
      title: section.title,
      order: sectionNumber,
      itemsCount: section.items.length,
    });

    section.items.forEach((itemTitle, itemIndex) => {
      const itemNumber = itemIndex + 1;

      const itemId =
        `${FRAMEWORK_ID}-item-${String(sectionNumber).padStart(2, "0")}-${String(itemNumber).padStart(2, "0")}`;

      const itemData = {
        ...itemBase,

        id: itemId,
        orgId: ORG_ID,
        frameworkId: FRAMEWORK_ID,
        sectionId,

        title: itemTitle,
        order: itemNumber,
        sequence: itemNumber,

        createdAt: now,
        updatedAt: now,
      };

      operations.push({
        type: "set",
        ref: orgRef
          .collection("evaluationRubricItems")
          .doc(itemId),
        data: itemData,
      });

      createdItems.push({
        id: itemId,
        sectionId,
        title: itemTitle,
        order: itemNumber,
      });
    });
  });

  /*
   * فقط تحديث metadata للـ framework.
   */
  operations.push({
    type: "set",
    ref: frameworkRef,
    data: {
      ...frameworkSnap.data(),

      id: FRAMEWORK_ID,

      rubricSectionsCount: NEW_RUBRIC.length,
      rubricItemsCount: newItemsCount,

      updatedAt: now,

      rubricReplacementTool:
        "replace-values-teacher-rubric.cjs",
    },
  });

  const report = {
    decision:
      conflicts.length > 0
        ? "STOPPED"
        : APPLY
          ? "READY_TO_APPLY"
          : "SAFE_PREVIEW",

    mode: APPLY ? "APPLY" : "PREVIEW",

    framework: {
      id: FRAMEWORK_ID,
      title: frameworkSnap.exists
        ? asString(frameworkSnap.data().title)
        : "",
    },

    currentState: {
      oldSections: oldSections.length,
      oldItems: oldItems.length,
      submissions: frameworkSubmissions.length,
    },

    newRubric: {
      sections: NEW_RUBRIC.length,
      items: newItemsCount,
    },

    plannedChanges: {
      deleteOldSections: oldSections.length,
      deleteOldItems: oldItems.length,

      createNewSections: createdSections.length,
      createNewItems: createdItems.length,

      updateFramework: 1,

      totalOperations: operations.length,

      submissionsTouched: 0,
      plansTouched: 0,
      cyclesTouched: 0,
      evaluatorAssignmentsTouched: 0,
    },

    createdSections,
    createdItems,

    conflicts,

    safety: {
      submissionsRequiredToBeZero: true,
      submissionsTouched: 0,
      evaluationPlansTouched: 0,
      evaluationCyclesTouched: 0,
      evaluatorAssignmentsTouched: 0,
      frameworkIdPreserved: true,
      requiresApplyFlag: true,
    },
  };

  const reportPath = writeReport(report);

  console.dir(
    {
      decision: report.decision,
      mode: report.mode,
      reportPath,

      framework: report.framework,

      currentState: report.currentState,

      newRubric: report.newRubric,

      plannedChanges: report.plannedChanges,

      conflictsCount: conflicts.length,
      conflicts,
    },
    { depth: 20 },
  );

  if (conflicts.length > 0) {
    console.log("");
    console.log(
      "Stopped. No changes were performed.",
    );

    process.exit(1);
  }

  if (!APPLY) {
    console.log("");
    console.log("No writes performed.");
    console.log(
      "Review the JSON report before applying.",
    );

    return;
  }

  const committed =
    await commitInChunks(operations);

  const applyResult = {
    decision: "APPLIED",
    committedOperations: committed,

    oldSectionsDeleted: oldSections.length,
    oldItemsDeleted: oldItems.length,

    newSectionsCreated: createdSections.length,
    newItemsCreated: createdItems.length,

    submissionsTouched: 0,
  };

  const applyReportPath = writeReport({
    ...report,
    applyResult,
  });

  console.dir({
    ...applyResult,
    applyReportPath,
  });
}

main().catch((error) => {
  console.error(
    "Replace rubric failed:",
    error,
  );

  process.exit(1);
});