import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import type {
  PersonSupervisionCapability,
  PersonSupervisionScope,
} from "@takween/contracts";

type ScopePlan = Pick<
  PersonSupervisionScope,
  "personId" | "schoolId" | "subjectScope" | "subjectKeys"
>;

const capabilities: readonly PersonSupervisionCapability[] = [
  "TEACHER_WORK_VIEW",
  "LESSON_PREP_REVIEW",
];

const scopePlans: readonly ScopePlan[] = [
  {
    personId: "p-s-sayed",
    schoolId: "mrb-girls",
    subjectScope: "ALL_SUBJECTS",
    subjectKeys: [],
  },
  {
    personId: "p-s-sayed",
    schoolId: "mrb-boys-sayh",
    subjectScope: "SUBJECT_KEYS",
    subjectKeys: ["ARABIC", "QURAN"],
  },
  {
    personId: "p-s-sayed",
    schoolId: "mrb-boys-faleh",
    subjectScope: "SUBJECT_KEYS",
    subjectKeys: ["ARABIC", "QURAN"],
  },
  {
    personId: "p-n-alshaya",
    schoolId: "mrb-boys-sayh",
    subjectScope: "SUBJECT_KEYS",
    subjectKeys: ["ENGLISH"],
  },
  {
    personId: "p-n-alshaya",
    schoolId: "mrb-boys-faleh",
    subjectScope: "SUBJECT_KEYS",
    subjectKeys: ["ENGLISH"],
  },
  {
    personId: "staff-NOFByrx0XLVovqxuFjfwRWSokgs1",
    schoolId: "mrb-boys-sayh",
    subjectScope: "SUBJECT_KEYS",
    subjectKeys: ["MATH", "SCIENCE"],
  },
  {
    personId: "staff-NOFByrx0XLVovqxuFjfwRWSokgs1",
    schoolId: "mrb-boys-faleh",
    subjectScope: "SUBJECT_KEYS",
    subjectKeys: ["MATH", "SCIENCE"],
  },
];

function getArgument(name: string) {
  const equalArgument = process.argv.find((argument) => argument.startsWith(`${name}=`));
  if (equalArgument) return equalArgument.slice(name.length + 1).trim();

  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? "").trim() : "";
}

async function main() {
  const orgId = getArgument("--orgId");
  const apply = process.argv.includes("--apply");

  if (!orgId) {
    throw new Error("--orgId is required.");
  }

  const now = Date.now();
  const scopes: PersonSupervisionScope[] = scopePlans.flatMap((plan) =>
    capabilities.map((capability) => ({
      id: `${plan.personId}__${capability}__${plan.schoolId}`,
      orgId,
      personId: plan.personId,
      capability,
      schoolId: plan.schoolId,
      subjectScope: plan.subjectScope,
      subjectKeys: [...plan.subjectKeys],
      isActive: true,
      createdAt: now,
      updatedAt: now,
    })),
  );

  if (!apply) {
    console.log(JSON.stringify({ dryRun: true, count: scopes.length, scopes }, null, 2));
    console.log("Dry run only. Re-run with --apply to write these documents.");
    return;
  }

  if (!getApps().length) {
    initializeApp({ credential: applicationDefault() });
  }

  const db = getFirestore();
  const batch = db.batch();
  for (const scope of scopes) {
    batch.set(
      db.doc(`orgs/${orgId}/personSupervisionScopes/${scope.id}`),
      scope,
    );
  }
  await batch.commit();

  console.log(`Seeded ${scopes.length} PersonSupervisionScope documents for ${orgId}.`);
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
