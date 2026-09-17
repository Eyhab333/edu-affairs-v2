import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import type { PersonSupervisionScope } from "@takween/contracts";

const legacyReviewerPersonIds = [
  "p-t-altwala",
  "p-malrameh",
  "p-f-alhamaad",
  "p-a-almansur",
] as const;
const kindergartenSchoolIds = new Set(["kg-01", "kg-02", "kg-03", "kg-04"]);

const reviewerPlans = [
  { personId: "p-a-alhomidi", schoolId: "kg-01" },
  { personId: "p-s-alturiqe", schoolId: "kg-02" },
  { personId: "p-s-alnafea", schoolId: "kg-03" },
  { personId: "p-n-alhamiyn", schoolId: "kg-04" },
] as const;

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

  if (!getApps().length) {
    initializeApp({ credential: applicationDefault() });
  }

  const db = getFirestore();
  const scopes: PersonSupervisionScope[] = reviewerPlans.map((plan) => {
    const now = Date.now();
    return {
      id: `${plan.personId}__LESSON_PREP_REVIEW__${plan.schoolId}`,
      orgId,
      personId: plan.personId,
      capability: "LESSON_PREP_REVIEW",
      schoolId: plan.schoolId,
      subjectScope: "ALL_SUBJECTS",
      subjectKeys: [],
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
  });

  const scopeCollection = db.collection(`orgs/${orgId}/personSupervisionScopes`);
  const legacySnapshot = await scopeCollection
    .where("personId", "in", [...legacyReviewerPersonIds])
    .get();
  const legacyScopeReferences = legacySnapshot.docs
    .filter((document) => {
      const data = document.data();
      return (
        data.capability === "LESSON_PREP_REVIEW" &&
        typeof data.schoolId === "string" &&
        kindergartenSchoolIds.has(data.schoolId)
      );
    })
    .map((document) => document.ref);

  if (!apply) {
    console.log(
      JSON.stringify(
        {
          dryRun: true,
          upsertScopes: scopes,
          deleteScopePaths: legacyScopeReferences.map((reference) => reference.path),
        },
        null,
        2,
      ),
    );
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
  for (const reference of legacyScopeReferences) {
    batch.delete(reference);
  }
  await batch.commit();

  console.log(
    `Upserted ${scopes.length} kindergarten Lesson Prep review scopes and deleted ${legacyScopeReferences.length} legacy kindergarten Lesson Prep review scopes for ${orgId}.`,
  );
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
