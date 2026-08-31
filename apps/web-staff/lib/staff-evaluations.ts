import {
  collection,
  doc,
  Firestore,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import {
  EvaluationApplicabilityPolicySchema,
  type EvaluationApplicabilityAssignmentContext,
  type EvaluationApplicabilityPolicy,
  type EvaluationApplicabilityResolution,
} from "@takween/contracts";
import { resolveEvaluationApplicability } from "@takween/domain";

import { db, functions } from "@/lib/firebase";

export type StaffEvaluationTaskStatus =
  | "PENDING"
  | "DRAFT"
  | "SUBMITTED"
  | "APPROVED"
  | "LOCKED"
  | "CANCELLED";

export type StaffEvaluationTask = {
  id: string;
  orgId: string;

  planId: string;
  planTitle: string;

  cycleId: string;
  cycleTitle: string;
  cycleStatus?: string;

  frameworkId: string;
  frameworkTitle: string;

  targetPersonId: string;
  targetEmail?: string;
  targetDisplayName: string;
  targetRoleKey?: string;

  evaluatorPersonId: string;
  evaluatorEmail?: string;
  evaluatorRoleKey?: string;

  weight: number;
  status: StaffEvaluationTaskStatus;
  performanceImprovementStatus?: "NEEDS_REVIEW" | "PLAN_OPEN";

  submissionId?: string;

  actionHref: string;
};

export type StaffEvaluationWorkspace = {
  tasks: StaffEvaluationTask[];
  summary: {
    total: number;
    pending: number;
    draft: number;
    submitted: number;
    approved: number;
  };
};

type FirestoreDoc = {
  id?: string;
  [key: string]: unknown;
};

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0) {
  return typeof value === "number" ? value : fallback;
}

function normalizeSchoolIds(values: string[]) {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean)),
  );
}

function resolveTaskStatus(
  submission: FirestoreDoc | null,
): StaffEvaluationTaskStatus {
  if (!submission) return "PENDING";

  const status = asString(submission.status, "DRAFT");

  if (
    status === "DRAFT" ||
    status === "SUBMITTED" ||
    status === "APPROVED" ||
    status === "LOCKED" ||
    status === "CANCELLED"
  ) {
    return status;
  }

  return "DRAFT";
}

async function getDocData(path: string): Promise<FirestoreDoc | null> {
  const snap = await getDoc(doc(db, path));

  if (!snap.exists()) return null;

  return {
    id: snap.id,
    ...snap.data(),
  };
}

async function getCurrentPersonId(uid: string): Promise<string> {
  const user = await getDocData(`users/${uid}`);

  const personId = asString(user?.personId);

  return personId || uid;
}

async function getSubmissionsForEvaluation(params: {
  orgId: string;
  schoolId: string;
  cycleId: string;
  targetPersonId: string;
  evaluatorPersonId: string;
}): Promise<FirestoreDoc[]> {
  const snap = await getDocs(
    query(
      collection(db, `orgs/${params.orgId}/evaluationSubmissions`),
      where("schoolId", "==", params.schoolId),
      where("cycleId", "==", params.cycleId),
      where("targetPersonId", "==", params.targetPersonId),
      where("evaluatorPersonId", "==", params.evaluatorPersonId),
    ),
  );

  return snap.docs.map((item) => ({
    id: item.id,
    ...(item.data() as FirestoreDoc),
  }));
}

async function getSubmissionsForEvaluatorInSchools(params: {
  orgId: string;
  evaluatorPersonId: string;
  schoolIds: string[];
}): Promise<FirestoreDoc[]> {
  const schoolIds = normalizeSchoolIds(params.schoolIds);

  if (schoolIds.length === 0) {
    return [];
  }

  const submissionsRef = collection(
    db,
    `orgs/${params.orgId}/evaluationSubmissions`,
  );

  const snapshots = await Promise.all(
    schoolIds.map((schoolId) =>
      getDocs(
        query(
          submissionsRef,
          where("schoolId", "==", schoolId),
          where("evaluatorPersonId", "==", params.evaluatorPersonId),
        ),
      ),
    ),
  );

  const submissionMap = new Map<string, FirestoreDoc>();

  for (const snapshot of snapshots) {
    for (const item of snapshot.docs) {
      submissionMap.set(item.id, {
        id: item.id,
        ...(item.data() as FirestoreDoc),
      });
    }
  }

  return Array.from(submissionMap.values());
}

async function getActiveEvaluationApplicabilityPolicies(params: {
  orgId: string;
  schoolIds: string[];
}): Promise<EvaluationApplicabilityPolicy[]> {
  const schoolIds = normalizeSchoolIds(params.schoolIds);

  if (schoolIds.length === 0) return [];

  const policiesRef = collection(
    db,
    `orgs/${params.orgId}/evaluationApplicabilityPolicies`,
  );
  const snapshots = await Promise.all(
    schoolIds.map((schoolId) =>
      getDocs(
        query(
          policiesRef,
          where("schoolId", "==", schoolId),
          where("status", "==", "ACTIVE"),
        ),
      ),
    ),
  );

  const policies = new Map<string, EvaluationApplicabilityPolicy>();

  for (const snapshot of snapshots) {
    for (const item of snapshot.docs) {
      const parsed = EvaluationApplicabilityPolicySchema.safeParse({
        id: item.id,
        ...(item.data() as FirestoreDoc),
      });

      if (parsed.success) policies.set(item.id, parsed.data);
    }
  }

  return Array.from(policies.values());
}

function resolveAssignmentApplicability(params: {
  orgId: string;
  assignment: FirestoreDoc;
  plan: FirestoreDoc;
  cycle: FirestoreDoc;
  targetAssignment: FirestoreDoc;
  framework: FirestoreDoc | null;
  policies: EvaluationApplicabilityPolicy[];
  effectiveAt: number;
}): EvaluationApplicabilityResolution {
  return resolveEvaluationApplicability({
    context: {
      orgId: asString(params.assignment.orgId, params.orgId),
      schoolId: asString(
        params.assignment.schoolId,
        asString(params.cycle.schoolId, asString(params.plan.schoolId)),
      ),
      academicYearId: asString(
        params.assignment.academicYearId,
        asString(
          params.cycle.academicYearId,
          asString(params.plan.academicYearId),
        ),
      ),
      termId: asString(
        params.assignment.termId,
        asString(params.cycle.termId, asString(params.plan.termId)),
      ),
      planId: asString(params.assignment.planId),
      cycleId: asString(params.assignment.cycleId),
      evaluatorRoleKey: asString(params.assignment.evaluatorRoleKey),
      evaluatorPersonId: asString(params.assignment.evaluatorPersonId),
      targetRoleKey: asString(params.targetAssignment.targetRoleKey),
      targetKind: asString(
        params.targetAssignment.targetKind,
        asString(params.plan.targetKind),
      ) as EvaluationApplicabilityAssignmentContext["targetKind"],
      frameworkId: asString(params.plan.frameworkId),
      frameworkKind: asString(
        params.framework?.frameworkKind,
      ) as EvaluationApplicabilityAssignmentContext["frameworkKind"],
      planKind: asString(
        params.plan.planKind,
      ) as EvaluationApplicabilityAssignmentContext["planKind"],
    },
    policies: params.policies,
    effectiveAt: params.effectiveAt,
  });
}

function findMatchingSubmission(
  submissions: FirestoreDoc[],
  params: {
    planId: string;
    cycleId: string;
    targetPersonId: string;
    evaluatorPersonId: string;
  },
) {
  return (
    submissions.find((submission) => {
      return (
        submission.planId === params.planId &&
        submission.cycleId === params.cycleId &&
        submission.targetPersonId === params.targetPersonId &&
        submission.evaluatorPersonId === params.evaluatorPersonId
      );
    }) ?? null
  );
}

export async function buildStaffEvaluationWorkspace(params: {
  uid: string;
  orgId?: string;
  schoolIds: string[];
}): Promise<StaffEvaluationWorkspace> {
  const orgId = params.orgId ?? "takween";
  const evaluatorPersonId = await getCurrentPersonId(params.uid);

  const schoolIds = normalizeSchoolIds(params.schoolIds);

  if (schoolIds.length === 0) {
    return {
      tasks: [],
      summary: {
        total: 0,
        pending: 0,
        draft: 0,
        submitted: 0,
        approved: 0,
      },
    };
  }

  const assignmentsRef = collection(
    db,
    `orgs/${orgId}/evaluationEvaluatorAssignments`,
  );

  const assignmentSnapshots = await Promise.all(
    schoolIds.map((schoolId) =>
      getDocs(
        query(
          assignmentsRef,
          where("schoolId", "==", schoolId),
          where("evaluatorPersonId", "==", evaluatorPersonId),
          where("status", "==", "ACTIVE"),
        ),
      ),
    ),
  );

  const assignmentMap = new Map<string, FirestoreDoc>();

  for (const snapshot of assignmentSnapshots) {
    for (const item of snapshot.docs) {
      assignmentMap.set(item.id, {
        id: item.id,
        ...(item.data() as FirestoreDoc),
      });
    }
  }

  const assignments = Array.from(assignmentMap.values());

  const applicabilityAt = Date.now();
  const [submissions, signalSnapshots, applicabilityPolicies] =
    await Promise.all([
      getSubmissionsForEvaluatorInSchools({
        orgId,
        evaluatorPersonId,
        schoolIds,
      }),
      Promise.all(
        schoolIds.map((schoolId) =>
          getDocs(
            query(
              collection(db, `orgs/${orgId}/performanceImprovementSignals`),
              where("schoolId", "==", schoolId),
            ),
          ),
        ),
      ),
      getActiveEvaluationApplicabilityPolicies({ orgId, schoolIds }),
    ]);

  const signalByPlanAndTarget = new Map<string, FirestoreDoc>();

  for (const snapshot of signalSnapshots) {
    for (const item of snapshot.docs) {
      const signal = item.data() as FirestoreDoc;
      const status = asString(signal.status);

      if (status !== "NEEDS_REVIEW" && status !== "PLAN_OPEN") continue;

      const evaluationPlanIds = Array.isArray(signal.evaluationPlanIds)
        ? signal.evaluationPlanIds.filter(
            (value): value is string => typeof value === "string",
          )
        : [];

      for (const evaluationPlanId of evaluationPlanIds) {
        const key = `${evaluationPlanId}--${asString(signal.targetPersonId)}`;
        signalByPlanAndTarget.set(key, { id: item.id, ...signal });
      }
    }
  }

  const resolvedTasks = await Promise.all(
    assignments.map(async (assignment): Promise<StaffEvaluationTask | null> => {
      const planId = asString(assignment.planId);
      const cycleId = asString(assignment.cycleId);
      const targetPersonId = asString(assignment.targetPersonId);

      const [plan, cycle, targetAssignment] = await Promise.all([
        getDocData(`orgs/${orgId}/evaluationPlans/${planId}`),

        getDocData(`orgs/${orgId}/evaluationCycles/${cycleId}`),

        getDocData(
          `orgs/${orgId}/evaluationTargetAssignments/${planId}-target-${targetPersonId}`,
        ),
      ]);

      const frameworkId = asString(plan?.frameworkId);

      const framework = frameworkId
        ? await getDocData(`orgs/${orgId}/evaluationFrameworks/${frameworkId}`)
        : null;

      const applicability = resolveAssignmentApplicability({
        orgId,
        assignment,
        plan: plan ?? {},
        cycle: cycle ?? {},
        targetAssignment: targetAssignment ?? {},
        framework,
        policies: applicabilityPolicies,
        effectiveAt: applicabilityAt,
      });

      if (applicability.applicabilityStatus === "NOT_APPLICABLE") {
        return null;
      }

      const submission = findMatchingSubmission(submissions, {
        planId,
        cycleId,
        targetPersonId,
        evaluatorPersonId,
      });

      const status = resolveTaskStatus(submission);
      const improvementSignal = signalByPlanAndTarget.get(
        `${planId}--${targetPersonId}`,
      );
      const improvementStatus = asString(improvementSignal?.status);

      const submissionId = submission?.id ? String(submission.id) : undefined;

      return {
        id: String(assignment.id),
        orgId,

        planId,
        planTitle: asString(plan?.title, "خطة تقييم"),

        cycleId,
        cycleTitle: asString(cycle?.title, "دورة تقييم"),
        cycleStatus: asString(cycle?.status),

        frameworkId,
        frameworkTitle: asString(framework?.title, "تقييم"),

        targetPersonId,
        targetEmail: asString(targetAssignment?.targetEmail),

        targetDisplayName: asString(
          targetAssignment?.targetDisplayName,
          asString(targetAssignment?.targetEmail, targetPersonId),
        ),

        targetRoleKey: asString(targetAssignment?.targetRoleKey),

        evaluatorPersonId,
        evaluatorEmail: asString(assignment.evaluatorEmail),
        evaluatorRoleKey: asString(assignment.evaluatorRoleKey),

        weight: asNumber(assignment.weight, 100),

        status,
        ...(improvementStatus === "NEEDS_REVIEW" ||
        improvementStatus === "PLAN_OPEN"
          ? { performanceImprovementStatus: improvementStatus }
          : {}),
        submissionId,

        actionHref: `/staff/evaluations/cycles/${cycleId}/targets/${targetPersonId}`,
      } satisfies StaffEvaluationTask;
    }),
  );

  const tasks = resolvedTasks.filter(
    (task): task is StaffEvaluationTask => task !== null,
  );

  const summary = {
    total: tasks.length,

    pending: tasks.filter((task) => task.status === "PENDING").length,

    draft: tasks.filter((task) => task.status === "DRAFT").length,

    submitted: tasks.filter((task) => task.status === "SUBMITTED").length,

    approved: tasks.filter((task) => task.status === "APPROVED").length,
  };

  return {
    tasks,
    summary,
  };
}

export function getEvaluationTaskStatusLabel(
  status: StaffEvaluationTaskStatus,
) {
  switch (status) {
    case "PENDING":
      return "لم يبدأ";
    case "DRAFT":
      return "مسودة";
    case "SUBMITTED":
      return "مرسل";
    case "APPROVED":
      return "معتمد";
    case "LOCKED":
      return "مقفل";
    case "CANCELLED":
      return "ملغي";
    default:
      return status;
  }
}

export type EvaluationFormSection = {
  id: string;
  title: string;
  description?: string;
  order: number;
  weight: number;
};

export type EvaluationFormItem = {
  id: string;
  sectionId: string;
  title: string;
  description?: string;
  order: number;
  maxScore: number;
  scoreInputType: string;
  isRequired: boolean;
};

export type EvaluationSubmissionFormData = {
  orgId: string;
  schoolId: string;
  academicYearId: string;
  termId: string;

  planId: string;
  planTitle: string;

  cycleId: string;
  cycleTitle: string;
  cycleStatus?: string;

  frameworkId: string;
  frameworkTitle: string;

  targetPersonId: string;
  targetDisplayName: string;
  targetEmail?: string;
  targetRoleKey?: string;

  evaluatorPersonId: string;
  evaluatorEmail?: string;
  evaluatorRoleKey?: string;
  evaluatorAssignmentId: string;
  weight: number;
  canApprove: boolean;

  sections: EvaluationFormSection[];
  items: EvaluationFormItem[];

  existingSubmissionId?: string;
  existingSubmissionStatus?: StaffEvaluationTaskStatus;
  existingGeneralNote?: string;
  existingItemScores?: {
    itemId: string;
    score: number;
  }[];
};

function asBoolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

async function getRubricSections(orgId: string, frameworkId: string) {
  const snap = await getDocs(
    query(
      collection(db, `orgs/${orgId}/evaluationRubricSections`),
      where("frameworkId", "==", frameworkId),
    ),
  );

  return snap.docs
    .map((item) => {
      const data = item.data();

      return {
        id: item.id,
        title: asString(data.title, "محور"),
        description: asString(data.description),
        order: asNumber(data.order),
        weight: asNumber(data.weight),
      } satisfies EvaluationFormSection;
    })
    .sort((a, b) => a.order - b.order);
}

async function getRubricItems(orgId: string, frameworkId: string) {
  const snap = await getDocs(
    query(
      collection(db, `orgs/${orgId}/evaluationRubricItems`),
      where("frameworkId", "==", frameworkId),
    ),
  );

  return snap.docs
    .map((item) => {
      const data = item.data();

      return {
        id: item.id,
        sectionId: asString(data.sectionId),
        title: asString(data.title, "بند تقييم"),
        description: asString(data.description),
        order: asNumber(data.order),
        maxScore: asNumber(data.maxScore, 5),
        scoreInputType: asString(data.scoreInputType, "SCORE"),
        isRequired: asBoolean(data.isRequired, true),
      } satisfies EvaluationFormItem;
    })
    .sort((a, b) => {
      const sectionCompare = a.sectionId.localeCompare(b.sectionId);
      if (sectionCompare !== 0) return sectionCompare;
      return a.order - b.order;
    });
}

async function canEvaluatorApprove(params: {
  orgId: string;
  schoolId: string;
  planId: string;
  evaluatorRoleKey: string;
}) {
  if (
    params.evaluatorRoleKey === "platform_owner" ||
    params.evaluatorRoleKey === "platform_admin" ||
    params.evaluatorRoleKey === "org_owner" ||
    params.evaluatorRoleKey === "org_admin"
  ) {
    return true;
  }

  const snap = await getDocs(
    query(
      collection(db, `orgs/${params.orgId}/evaluatorPolicies`),
      where("schoolId", "==", params.schoolId),
      where("planId", "==", params.planId),
    ),
  );

  return snap.docs.some((item) => {
    const data = item.data();

    return (
      data.evaluatorRoleKey === params.evaluatorRoleKey &&
      data.canApprove === true
    );
  });
}

export async function loadEvaluationSubmissionForm(params: {
  uid: string;
  orgId?: string;
  schoolIds: string[];
  cycleId: string;
  targetPersonId: string;
}): Promise<EvaluationSubmissionFormData | null> {
  const orgId = params.orgId ?? "takween";
  const evaluatorPersonId = await getCurrentPersonId(params.uid);
  const allowedSchoolIds = normalizeSchoolIds(params.schoolIds);
  const cycle = await getDocData(
    `orgs/${orgId}/evaluationCycles/${params.cycleId}`,
  );
  const cycleSchoolId = asString(cycle?.schoolId);

  if (
    !cycle ||
    !cycleSchoolId ||
    !allowedSchoolIds.includes(cycleSchoolId)
  ) {
    return null;
  }

  const assignmentsSnap = await getDocs(
    query(
      collection(db, `orgs/${orgId}/evaluationEvaluatorAssignments`),
      where("schoolId", "==", cycleSchoolId),
      where("cycleId", "==", params.cycleId),
      where("targetPersonId", "==", params.targetPersonId),
      where("evaluatorPersonId", "==", evaluatorPersonId),
      where("status", "==", "ACTIVE"),
    ),
  );

  const assignmentDoc = assignmentsSnap.docs[0];

  if (!assignmentDoc) return null;

  const assignment: FirestoreDoc = {
    id: assignmentDoc.id,
    ...(assignmentDoc.data() as FirestoreDoc),
  };

  const planId = asString(assignment.planId);
  const cycleId = asString(assignment.cycleId);
  const targetPersonId = asString(assignment.targetPersonId);

  const [plan, targetAssignment] = await Promise.all([
    getDocData(`orgs/${orgId}/evaluationPlans/${planId}`),
    getDocData(
      `orgs/${orgId}/evaluationTargetAssignments/${planId}-target-${targetPersonId}`,
    ),
  ]);

  if (!plan || !cycle || !targetAssignment) return null;

  const schoolId = asString(
    assignment.schoolId,
    asString(cycle.schoolId, asString(plan.schoolId)),
  );
  const academicYearId = asString(
    assignment.academicYearId,
    asString(cycle.academicYearId, asString(plan.academicYearId)),
  );
  const termId = asString(
    assignment.termId,
    asString(cycle.termId, asString(plan.termId)),
  );

  if (!schoolId || !academicYearId || !termId) return null;

  const frameworkId = asString(plan.frameworkId);

  const evaluatorRoleKey = asString(assignment.evaluatorRoleKey);

  const canApprove = await canEvaluatorApprove({
    orgId,
    schoolId,
    planId,
    evaluatorRoleKey,
  });

  const [framework, sections, items, submissions] = await Promise.all([
    getDocData(`orgs/${orgId}/evaluationFrameworks/${frameworkId}`),
    getRubricSections(orgId, frameworkId),
    getRubricItems(orgId, frameworkId),
    getSubmissionsForEvaluation({
      orgId,
      schoolId,
      cycleId,
      targetPersonId,
      evaluatorPersonId,
    }),
  ]);

  if (!framework) return null;

  const applicabilityPolicies = await getActiveEvaluationApplicabilityPolicies({
    orgId,
    schoolIds: [schoolId],
  });
  const applicability = resolveAssignmentApplicability({
    orgId,
    assignment,
    plan,
    cycle,
    targetAssignment,
    framework,
    policies: applicabilityPolicies,
    effectiveAt: Date.now(),
  });

  if (applicability.applicabilityStatus === "NOT_APPLICABLE") {
    return null;
  }

  const existingSubmission = findMatchingSubmission(submissions, {
    planId,
    cycleId,
    targetPersonId,
    evaluatorPersonId,
  });

  return {
    orgId,
    schoolId,
    academicYearId,
    termId,

    planId,
    planTitle: asString(plan.title, "خطة تقييم"),

    cycleId,
    cycleTitle: asString(cycle.title, "دورة تقييم"),
    cycleStatus: asString(cycle.status),

    frameworkId,
    frameworkTitle: asString(framework.title, "تقييم"),

    targetPersonId,
    targetDisplayName: asString(
      targetAssignment.targetDisplayName,
      asString(targetAssignment.targetEmail, targetPersonId),
    ),
    targetEmail: asString(targetAssignment.targetEmail),
    targetRoleKey: asString(targetAssignment.targetRoleKey),

    evaluatorPersonId,
    evaluatorEmail: asString(assignment.evaluatorEmail),
    evaluatorRoleKey,
    evaluatorAssignmentId: String(assignment.id),
    weight: asNumber(assignment.weight, 100),
    canApprove,

    sections,
    items,

    existingSubmissionId: existingSubmission?.id
      ? String(existingSubmission.id)
      : undefined,

    existingSubmissionStatus: existingSubmission
      ? resolveTaskStatus(existingSubmission)
      : undefined,

    existingGeneralNote: asString(existingSubmission?.generalNote),

    existingItemScores: Array.isArray(existingSubmission?.itemScores)
      ? existingSubmission.itemScores
          .map((itemScore) => {
            if (!itemScore || typeof itemScore !== "object") return null;

            const data = itemScore as {
              itemId?: unknown;
              score?: unknown;
            };

            const itemId = asString(data.itemId);

            if (!itemId || typeof data.score !== "number") return null;

            return {
              itemId,
              score: data.score,
            };
          })
          .filter(
            (itemScore): itemScore is { itemId: string; score: number } => {
              return itemScore !== null;
            },
          )
      : [],
  };
}

function clampScore(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function scoreValue(value: unknown) {
  if (value === undefined || value === null || value === "") return null;

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function buildDraftSubmissionId(params: {
  cycleId: string;
  targetPersonId: string;
  evaluatorPersonId: string;
}) {
  return `${params.cycleId}-${params.targetPersonId}-${params.evaluatorPersonId}`;
}

export async function saveEvaluationDraft(params: {
  uid: string;
  orgId?: string;
  schoolIds: string[];
  cycleId: string;
  targetPersonId: string;
  scores: Record<string, string>;
  generalNote: string;
}) {
  const orgId = params.orgId ?? "takween";

  const formData = await loadEvaluationSubmissionForm({
    uid: params.uid,
    orgId,
    schoolIds: params.schoolIds,
    cycleId: params.cycleId,
    targetPersonId: params.targetPersonId,
  });

  if (!formData) {
    throw new Error("لم يتم العثور على إسناد تقييم مناسب لهذا المستخدم.");
  }

  if (formData.cycleStatus !== "OPEN") {
    throw new Error("لا يمكن حفظ المسودة لأن دورة التقييم ليست مفتوحة.");
  }

  if (
    formData.existingSubmissionStatus === "SUBMITTED" ||
    formData.existingSubmissionStatus === "APPROVED" ||
    formData.existingSubmissionStatus === "LOCKED" ||
    formData.existingSubmissionStatus === "CANCELLED"
  ) {
    throw new Error("لا يمكن حفظ مسودة بعد إرسال أو اعتماد التقييم.");
  }

  const sectionById = new Map(
    formData.sections.map((section) => [section.id, section]),
  );

  const itemScores = formData.items.flatMap((item) => {
    const value = scoreValue(params.scores[item.id]);

    if (value === null) return [];

    const score = clampScore(value, 0, item.maxScore);
    const section = sectionById.get(item.sectionId);

    return [
      {
        itemId: item.id,
        sectionId: item.sectionId,
        itemTitle: item.title,
        sectionTitle: section?.title ?? "",
        score,
        maxScore: item.maxScore,
        order: item.order,
      },
    ];
  });

  const rawScore = itemScores.reduce((sum, item) => sum + item.score, 0);

  const maxScore = formData.items.reduce((sum, item) => sum + item.maxScore, 0);

  const normalizedScore = maxScore > 0 ? (rawScore / maxScore) * 100 : 0;
  const weightedScore = normalizedScore * (formData.weight / 100);

  const ts = Date.now();

  const submissionId =
    formData.existingSubmissionId ??
    buildDraftSubmissionId({
      cycleId: formData.cycleId,
      targetPersonId: formData.targetPersonId,
      evaluatorPersonId: formData.evaluatorPersonId,
    });

  const submission = {
    id: submissionId,
    orgId,

    schoolId: formData.schoolId,
    academicYearId: formData.academicYearId,
    termId: formData.termId,

    planId: formData.planId,
    cycleId: formData.cycleId,
    frameworkId: formData.frameworkId,

    targetPersonId: formData.targetPersonId,
    targetEmail: formData.targetEmail ?? "",

    evaluatorPersonId: formData.evaluatorPersonId,
    evaluatorEmail: formData.evaluatorEmail ?? "",
    evaluatorRoleKey: formData.evaluatorRoleKey ?? "",

    status: "DRAFT",

    itemScores,

    rawScore,
    maxScore,
    normalizedScore,
    weightedScore,

    generalNote: params.generalNote.trim(),

    updatedAt: ts,
    ...(formData.existingSubmissionId ? {} : { createdAt: ts }),
  };

  await setDoc(
    doc(db, `orgs/${orgId}/evaluationSubmissions/${submissionId}`),
    submission,
    { merge: true },
  );

  return {
    submissionId,
    rawScore,
    maxScore,
    normalizedScore,
    weightedScore,
    completedItems: itemScores.length,
    totalItems: formData.items.length,
  };
}

export async function submitEvaluation(params: {
  uid: string;
  orgId?: string;
  schoolIds: string[];
  cycleId: string;
  targetPersonId: string;
  scores: Record<string, string>;
  generalNote: string;
}) {
  const orgId = params.orgId ?? "takween";

  const formData = await loadEvaluationSubmissionForm({
    uid: params.uid,
    orgId,
    schoolIds: params.schoolIds,
    cycleId: params.cycleId,
    targetPersonId: params.targetPersonId,
  });

  if (!formData) {
    throw new Error("لم يتم العثور على إسناد تقييم مناسب لهذا المستخدم.");
  }

  if (formData.cycleStatus !== "OPEN") {
    throw new Error("لا يمكن إرسال التقييم لأن دورة التقييم ليست مفتوحة.");
  }

  if (
    formData.existingSubmissionStatus === "SUBMITTED" ||
    formData.existingSubmissionStatus === "APPROVED" ||
    formData.existingSubmissionStatus === "LOCKED" ||
    formData.existingSubmissionStatus === "CANCELLED"
  ) {
    throw new Error("لا يمكن تعديل هذا التقييم بعد إرساله أو اعتماده.");
  }

  const missingRequiredItems = formData.items.filter((item) => {
    if (!item.isRequired) return false;

    const value = scoreValue(params.scores[item.id]);

    return value === null;
  });

  if (missingRequiredItems.length > 0) {
    const names = missingRequiredItems
      .slice(0, 5)
      .map((item) => `- ${item.title}`)
      .join("\n");

    throw new Error(
      `لا يمكن إرسال التقييم قبل إكمال كل البنود المطلوبة.\n\nالبنود الناقصة:\n${names}`,
    );
  }

  const sectionById = new Map(
    formData.sections.map((section) => [section.id, section]),
  );

  const itemScores = formData.items.flatMap((item) => {
    const value = scoreValue(params.scores[item.id]);

    if (value === null) return [];

    const score = clampScore(value, 0, item.maxScore);
    const section = sectionById.get(item.sectionId);

    return [
      {
        itemId: item.id,
        sectionId: item.sectionId,
        itemTitle: item.title,
        sectionTitle: section?.title ?? "",
        score,
        maxScore: item.maxScore,
        order: item.order,
      },
    ];
  });

  const rawScore = itemScores.reduce((sum, item) => sum + item.score, 0);

  const maxScore = formData.items.reduce((sum, item) => sum + item.maxScore, 0);

  const normalizedScore = maxScore > 0 ? (rawScore / maxScore) * 100 : 0;
  const weightedScore = normalizedScore * (formData.weight / 100);

  const ts = Date.now();

  const submissionId =
    formData.existingSubmissionId ??
    buildDraftSubmissionId({
      cycleId: formData.cycleId,
      targetPersonId: formData.targetPersonId,
      evaluatorPersonId: formData.evaluatorPersonId,
    });

  const submission = {
    id: submissionId,
    orgId,

    schoolId: formData.schoolId,
    academicYearId: formData.academicYearId,
    termId: formData.termId,

    planId: formData.planId,
    cycleId: formData.cycleId,
    frameworkId: formData.frameworkId,

    targetPersonId: formData.targetPersonId,
    targetEmail: formData.targetEmail ?? "",

    evaluatorPersonId: formData.evaluatorPersonId,
    evaluatorEmail: formData.evaluatorEmail ?? "",
    evaluatorRoleKey: formData.evaluatorRoleKey ?? "",

    status: "SUBMITTED",

    itemScores,

    rawScore,
    maxScore,
    normalizedScore,
    weightedScore,

    generalNote: params.generalNote.trim(),

    submittedAt: ts,
    updatedAt: ts,
    ...(formData.existingSubmissionId ? {} : { createdAt: ts }),
  };

  await setDoc(
    doc(db, `orgs/${orgId}/evaluationSubmissions/${submissionId}`),
    submission,
    { merge: true },
  );

  return {
    submissionId,
    rawScore,
    maxScore,
    normalizedScore,
    weightedScore,
    completedItems: itemScores.length,
    totalItems: formData.items.length,
  };
}

export async function approveEvaluationSubmission(params: {
  uid: string;
  orgId?: string;
  schoolIds: string[];
  cycleId: string;
  targetPersonId: string;
}) {
  const orgId = params.orgId ?? "takween";

  const formData = await loadEvaluationSubmissionForm({
    uid: params.uid,
    orgId,
    schoolIds: params.schoolIds,
    cycleId: params.cycleId,
    targetPersonId: params.targetPersonId,
  });

  if (!formData) {
    throw new Error("لم يتم العثور على إسناد تقييم مناسب لهذا المستخدم.");
  }

  if (!formData.existingSubmissionId) {
    throw new Error("لا يوجد تقييم مرسل لاعتماده.");
  }

  if (formData.existingSubmissionStatus !== "SUBMITTED") {
    throw new Error("لا يمكن اعتماد التقييم إلا إذا كانت حالته مرسل.");
  }

  const approve = httpsCallable<
    {
      orgId: string;
      submissionId: string;
    },
    {
      ok: true;
      submissionId: string;
      cycleSummaryId: string;
      staffSummaryId: string;
      normalizedScore: number;
      weightedScore: number;
      completedSubmissionsCount: number;
      missingSubmissionsCount: number;
      cycleCompleted: boolean;
      approvedAt: number;
    }
  >(functions, "approveEvaluationSubmission");

  const response = await approve({
    orgId,
    submissionId: formData.existingSubmissionId,
  });

  return response.data;
}

export type MyEvaluationCycleResult = {
  id: string;
  detailsHref: string;
  orgId: string;

  planId: string;
  planTitle: string;

  cycleId: string;
  cycleTitle: string;

  frameworkId?: string;
  frameworkTitle?: string;

  targetPersonId: string;
  targetEmail?: string;

  finalScore: number;
  maxScore: number;
  status: string;
  includedInAverage: boolean;

  submittedAt?: number;
  approvedAt?: number;
};

export type MyEvaluationSummary = {
  targetPersonId: string;
  targetEmail?: string;

  approvedAverageScore: number;
  approvedCyclesCount: number;
  lastApprovedScore: number;

  submittedAverageScore: number;
  submittedCyclesCount: number;
  lastSubmittedScore: number;
};

export type MyEvaluationsView = {
  summary: MyEvaluationSummary | null;
  results: MyEvaluationCycleResult[];
};

async function getStaffSummaryForTarget(params: {
  orgId: string;
  targetPersonId: string;
  schoolIds: string[];
}): Promise<FirestoreDoc | null> {
  const schoolIds = normalizeSchoolIds(params.schoolIds);

  if (schoolIds.length === 0) {
    return null;
  }

  const summariesRef = collection(
    db,
    `orgs/${params.orgId}/evaluationStaffSummaries`,
  );

  const snapshots = await Promise.all(
    schoolIds.map((schoolId) =>
      getDocs(
        query(
          summariesRef,
          where("schoolId", "==", schoolId),
          where("targetPersonId", "==", params.targetPersonId),
        ),
      ),
    ),
  );

  const first = snapshots
    .flatMap((snapshot) => snapshot.docs)
    .sort((a, b) => {
      const aUpdatedAt = asNumber(a.data().updatedAt);

      const bUpdatedAt = asNumber(b.data().updatedAt);

      return bUpdatedAt - aUpdatedAt;
    })[0];

  if (!first) {
    return null;
  }

  return {
    id: first.id,
    ...first.data(),
  } as FirestoreDoc;
}

async function getApprovedCycleSummariesForTarget(params: {
  orgId: string;
  targetPersonId: string;
  schoolIds: string[];
}): Promise<FirestoreDoc[]> {
  const schoolIds = normalizeSchoolIds(params.schoolIds);

  if (schoolIds.length === 0) {
    return [];
  }

  const summariesRef = collection(
    db,
    `orgs/${params.orgId}/evaluationCycleTargetSummaries`,
  );

  const snapshots = await Promise.all(
    schoolIds.map((schoolId) =>
      getDocs(
        query(
          summariesRef,
          where("schoolId", "==", schoolId),
          where("targetPersonId", "==", params.targetPersonId),
          where("status", "==", "APPROVED"),
        ),
      ),
    ),
  );

  const summaryMap = new Map<string, FirestoreDoc>();

  for (const snapshot of snapshots) {
    for (const item of snapshot.docs) {
      summaryMap.set(item.id, {
        id: item.id,
        ...item.data(),
      } as FirestoreDoc);
    }
  }

  return Array.from(summaryMap.values()).sort(
    (a, b) => asNumber(b.approvedAt) - asNumber(a.approvedAt),
  );
}

export async function buildMyEvaluationsView(params: {
  uid: string;
  orgId?: string;
  schoolIds: string[];
}): Promise<MyEvaluationsView> {
  const orgId = params.orgId ?? "takween";

  const targetPersonId = await getCurrentPersonId(params.uid);

  const schoolIds = normalizeSchoolIds(params.schoolIds);

  if (schoolIds.length === 0) {
    return {
      summary: null,
      results: [],
    };
  }

  const [staffSummary, cycleSummaries] = await Promise.all([
    getStaffSummaryForTarget({
      orgId,
      targetPersonId,
      schoolIds,
    }),

    getApprovedCycleSummariesForTarget({
      orgId,
      targetPersonId,
      schoolIds,
    }),
  ]);

  const results: MyEvaluationCycleResult[] = await Promise.all(
    cycleSummaries.map(async (cycleSummary) => {
      const planId = asString(cycleSummary.planId);

      const cycleId = asString(cycleSummary.cycleId);

      const [plan, cycle] = await Promise.all([
        getDocData(`orgs/${orgId}/evaluationPlans/${planId}`),

        getDocData(`orgs/${orgId}/evaluationCycles/${cycleId}`),
      ]);

      const frameworkId = asString(plan?.frameworkId);

      const framework = frameworkId
        ? await getDocData(`orgs/${orgId}/evaluationFrameworks/${frameworkId}`)
        : null;

      return {
        id: String(cycleSummary.id),

        detailsHref: `/staff/my-evaluations/cycles/${cycleId}`,

        orgId,

        planId,
        planTitle: asString(plan?.title, "خطة تقييم"),

        cycleId,
        cycleTitle: asString(cycle?.title, "دورة تقييم"),

        frameworkId,
        frameworkTitle: asString(framework?.title, "تقييم"),

        targetPersonId,
        targetEmail: asString(cycleSummary.targetEmail),

        finalScore: asNumber(cycleSummary.finalScore),

        maxScore: asNumber(cycleSummary.maxScore, 100),

        status: asString(cycleSummary.status),

        includedInAverage: asBoolean(cycleSummary.includedInAverage, true),

        submittedAt: asNumber(cycleSummary.submittedAt),

        approvedAt: asNumber(cycleSummary.approvedAt),
      } satisfies MyEvaluationCycleResult;
    }),
  );

  const summary: MyEvaluationSummary | null = staffSummary
    ? {
        targetPersonId,

        targetEmail: asString(staffSummary.targetEmail),

        approvedAverageScore: asNumber(staffSummary.approvedAverageScore),

        approvedCyclesCount: asNumber(staffSummary.approvedCyclesCount),

        lastApprovedScore: asNumber(staffSummary.lastApprovedScore),

        submittedAverageScore: asNumber(staffSummary.submittedAverageScore),

        submittedCyclesCount: asNumber(staffSummary.submittedCyclesCount),

        lastSubmittedScore: asNumber(staffSummary.lastSubmittedScore),
      }
    : null;

  return {
    summary,
    results,
  };
}

export type MyEvaluationDetailItem = {
  itemId: string;
  sectionId: string;
  itemTitle: string;
  sectionTitle: string;
  score: number;
  maxScore: number;
  order: number;
  note?: string;
};

export type MyEvaluationDetailSection = {
  sectionId: string;
  sectionTitle: string;
  items: MyEvaluationDetailItem[];
  rawScore: number;
  maxScore: number;
};

export type MyEvaluationDetailView = {
  summaryId: string;

  planId: string;
  planTitle: string;

  cycleId: string;
  cycleTitle: string;

  frameworkId: string;
  frameworkTitle: string;

  targetPersonId: string;
  targetEmail?: string;

  finalScore: number;
  maxScore: number;
  approvedAt?: number;

  generalNote?: string;

  sections: MyEvaluationDetailSection[];
};

async function getApprovedCycleSummaryForTarget(params: {
  orgId: string;
  targetPersonId: string;
  cycleId: string;
  schoolIds: string[];
}): Promise<FirestoreDoc | null> {
  const schoolIds = normalizeSchoolIds(params.schoolIds);

  if (schoolIds.length === 0) return null;

  const summariesRef = collection(
    db,
    `orgs/${params.orgId}/evaluationCycleTargetSummaries`,
  );

  const snapshots = await Promise.all(
    schoolIds.map((schoolId) =>
      getDocs(
        query(
          summariesRef,
          where("schoolId", "==", schoolId),
          where("targetPersonId", "==", params.targetPersonId),
          where("cycleId", "==", params.cycleId),
          where("status", "==", "APPROVED"),
        ),
      ),
    ),
  );

  const first = snapshots
    .flatMap((snapshot) => snapshot.docs)
    .map((item) => ({
      id: item.id,
      ...item.data(),
    }))[0];

  return first ?? null;
}

async function getApprovedSubmissionForTargetCycle(params: {
  orgId: string;
  targetPersonId: string;
  cycleId: string;
  schoolId: string;
}): Promise<FirestoreDoc | null> {
  const snap = await getDocs(
    query(
      collection(db, `orgs/${params.orgId}/evaluationSubmissions`),
      where("schoolId", "==", params.schoolId),
      where("targetPersonId", "==", params.targetPersonId),
      where("cycleId", "==", params.cycleId),
      where("status", "==", "APPROVED"),
    ),
  );

  const first = snap.docs[0];

  if (!first) return null;

  return {
    id: first.id,
    ...first.data(),
  } as FirestoreDoc;
}

function buildDetailSections(
  itemScoresValue: unknown,
): MyEvaluationDetailSection[] {
  if (!Array.isArray(itemScoresValue)) return [];

  const items: MyEvaluationDetailItem[] = itemScoresValue.flatMap(
    (itemScore) => {
      if (!itemScore || typeof itemScore !== "object") return [];

      const data = itemScore as Record<string, unknown>;

      const itemId = asString(data.itemId);
      const sectionId = asString(data.sectionId);

      if (!itemId || !sectionId) return [];

      const note = asString(data.note);

      return [
        {
          itemId,
          sectionId,
          itemTitle: asString(data.itemTitle, "بند تقييم"),
          sectionTitle: asString(data.sectionTitle, "محور"),
          score: asNumber(data.score),
          maxScore: asNumber(data.maxScore, 5),
          order: asNumber(data.order),
          ...(note ? { note } : {}),
        },
      ];
    },
  );

  const sectionMap = new Map<string, MyEvaluationDetailSection>();

  for (const item of items) {
    const existing = sectionMap.get(item.sectionId);

    if (!existing) {
      sectionMap.set(item.sectionId, {
        sectionId: item.sectionId,
        sectionTitle: item.sectionTitle,
        items: [item],
        rawScore: item.score,
        maxScore: item.maxScore,
      });

      continue;
    }

    existing.items.push(item);
    existing.rawScore += item.score;
    existing.maxScore += item.maxScore;
  }

  return Array.from(sectionMap.values()).map((section) => ({
    ...section,
    items: section.items.sort((a, b) => a.order - b.order),
  }));
}

export async function buildMyEvaluationDetailView(params: {
  uid: string;
  orgId?: string;
  cycleId: string;
  schoolIds: string[];
}): Promise<MyEvaluationDetailView | null> {
  const orgId = params.orgId ?? "takween";
  const targetPersonId = await getCurrentPersonId(params.uid);

  const cycleSummary = await getApprovedCycleSummaryForTarget({
    orgId,
    targetPersonId,
    cycleId: params.cycleId,
    schoolIds: params.schoolIds,
  });

  if (!cycleSummary) return null;

  const schoolId = asString(cycleSummary.schoolId);

  if (!schoolId) return null;

  const submission = await getApprovedSubmissionForTargetCycle({
    orgId,
    targetPersonId,
    cycleId: params.cycleId,
    schoolId,
  });

  if (!submission) return null;

  const planId = asString(cycleSummary.planId);
  const cycleId = asString(cycleSummary.cycleId);

  const [plan, cycle] = await Promise.all([
    getDocData(`orgs/${orgId}/evaluationPlans/${planId}`),
    getDocData(`orgs/${orgId}/evaluationCycles/${cycleId}`),
  ]);

  const frameworkId = asString(plan?.frameworkId);
  const framework = frameworkId
    ? await getDocData(`orgs/${orgId}/evaluationFrameworks/${frameworkId}`)
    : null;

  return {
    summaryId: String(cycleSummary.id),

    planId,
    planTitle: asString(plan?.title, "خطة تقييم"),

    cycleId,
    cycleTitle: asString(cycle?.title, "دورة تقييم"),

    frameworkId,
    frameworkTitle: asString(framework?.title, "تقييم"),

    targetPersonId,
    targetEmail: asString(cycleSummary.targetEmail),

    finalScore: asNumber(cycleSummary.finalScore),
    maxScore: asNumber(cycleSummary.maxScore, 100),
    approvedAt: asNumber(cycleSummary.approvedAt),

    generalNote: asString(submission.generalNote),

    sections: buildDetailSections(submission.itemScores),
  };
}
