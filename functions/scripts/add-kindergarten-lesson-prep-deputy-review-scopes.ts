import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import type { PersonSupervisionScope } from "@takween/contracts";

const deputyPlans = [
  { personId: "staff-ms10LdA0k5TVkiJo4VO6pprmcOh2", schoolId: "kg-01" },
  { personId: "p-h-aljower", schoolId: "kg-02" },
  { personId: "p-s-alslman", schoolId: "kg-03" },
  { personId: "p-h-alshaya", schoolId: "kg-04" },
] as const;

function getArgument(name: string) {
  const equalArgument = process.argv.find((argument) =>
    argument.startsWith(`${name}=`),
  );
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

  if (!getApps().length) {
    initializeApp({ credential: applicationDefault() });
  }

  const db = getFirestore();
  const references = deputyPlans.map((plan) =>
    db.doc(
      `orgs/${orgId}/personSupervisionScopes/${plan.personId}__LESSON_PREP_REVIEW__${plan.schoolId}`,
    ),
  );
  const existingScopes = await db.getAll(...references);
  const now = Date.now();
  const scopes: PersonSupervisionScope[] = deputyPlans.map((plan, index) => {
    const existingCreatedAt = existingScopes[index]?.data()?.createdAt;
    return {
      id: `${plan.personId}__LESSON_PREP_REVIEW__${plan.schoolId}`,
      orgId,
      personId: plan.personId,
      capability: "LESSON_PREP_REVIEW",
      schoolId: plan.schoolId,
      subjectScope: "ALL_SUBJECTS",
      subjectKeys: [],
      isActive: true,
      createdAt: typeof existingCreatedAt === "number" ? existingCreatedAt : now,
      updatedAt: now,
    };
  });

  if (!apply) {
    console.log(JSON.stringify({ dryRun: true, upsertScopes: scopes }, null, 2));
    console.log("Dry run only. Re-run with --apply to write these changes.");
    return;
  }

  const batch = db.batch();
  for (const scope of scopes) {
    batch.set(
      db.doc(`orgs/${orgId}/personSupervisionScopes/${scope.id}`),
      scope,
    );
  }
  await batch.commit();

  console.log(`Upserted ${scopes.length} kindergarten deputy Lesson Prep review scopes for ${orgId}.`);
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
