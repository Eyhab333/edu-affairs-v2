import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type DocumentReference } from "firebase-admin/firestore";

const kindergartenSchoolIds = ["kg-01", "kg-02", "kg-03", "kg-04"] as const;
const kindergartenSchoolIdSet = new Set<string>(kindergartenSchoolIds);

type ProposedChange = {
  lessonPrepId: string;
  oldSchoolId: string;
  newSchoolId: string;
  classId: string;
  offeringId: string;
  status: string;
  resolutionSource: "OFFERING" | "CLASS_PATH";
  reference: DocumentReference;
};

type UnresolvedRecord = {
  lessonPrepId: string;
  oldSchoolId: string;
  classId: string;
  offeringId: string;
  status: string;
  reason: string;
};

type FirestoreRecord = Record<string, unknown>;

function getArgument(name: string) {
  const equalArgument = process.argv.find((argument) =>
    argument.startsWith(`${name}=`),
  );
  if (equalArgument) return equalArgument.slice(name.length + 1).trim();

  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? "").trim() : "";
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function chunk<T>(items: readonly T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
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
  const prepSnapshot = await db
    .collection(`orgs/${orgId}/subjectLessonPreps`)
    .where("status", "==", "SUBMITTED")
    .get();
  const offeringCache = new Map<string, Promise<FirestoreRecord | null>>();
  const classSchoolCache = new Map<string, Promise<string[]>>();
  const proposedChanges: ProposedChange[] = [];
  const unresolved: UnresolvedRecord[] = [];

  async function loadOffering(offeringId: string) {
    if (!offeringId) return null;

    const snapshot = await db
      .doc(`orgs/${orgId}/classSubjectOfferings/${offeringId}`)
      .get();
    if (!snapshot.exists) return null;

    return snapshot.data() ?? null;
  }

  async function resolveSchoolFromClassPath(params: {
    academicYearId: string;
    classId: string;
  }) {
    if (!params.academicYearId || !params.classId) return [] as string[];

    const snapshots = await db.getAll(
      ...kindergartenSchoolIds.map((schoolId) =>
        db.doc(
          `orgs/${orgId}/schools/${schoolId}/academicYears/${params.academicYearId}/classes/${params.classId}`,
        ),
      ),
    );

    return snapshots.flatMap((snapshot, index) => {
      if (!snapshot.exists) return [];

      const data = snapshot.data() ?? {};
      const schoolId = kindergartenSchoolIds[index];
      return data.orgId === orgId && data.schoolId === schoolId
        ? [schoolId]
        : [];
    });
  }

  for (const prepDocument of prepSnapshot.docs) {
    const data = prepDocument.data();
    const oldSchoolId = readString(data.schoolId);
    if (kindergartenSchoolIdSet.has(oldSchoolId)) continue;

    const classId = readString(data.classId);
    const offeringId = readString(
      data.classSubjectOfferingId || data.offeringId,
    );
    const academicYearId = readString(data.academicYearId);
    const status = readString(data.status);
    const baseRecord = {
      lessonPrepId: prepDocument.id,
      oldSchoolId,
      classId,
      offeringId,
      status,
    };

    if (offeringId) {
      const offeringPromise =
        offeringCache.get(offeringId) ?? loadOffering(offeringId);
      offeringCache.set(offeringId, offeringPromise);
      const offering = await offeringPromise;

      if (offering) {
        const offeringSchoolId = readString(offering.schoolId);
        const offeringClassId = readString(offering.classId);
        const offeringAcademicYearId = readString(offering.academicYearId);

        if (!kindergartenSchoolIdSet.has(offeringSchoolId)) continue;
        if (
          !classId ||
          offeringClassId !== classId ||
          !academicYearId ||
          offeringAcademicYearId !== academicYearId
        ) {
          unresolved.push({
            ...baseRecord,
            reason: "Offering context does not exactly match the lesson prep.",
          });
          continue;
        }

        proposedChanges.push({
          ...baseRecord,
          newSchoolId: offeringSchoolId,
          resolutionSource: "OFFERING",
          reference: prepDocument.ref,
        });
        continue;
      }
    }

    if (!classId || !academicYearId) {
      unresolved.push({
        ...baseRecord,
        reason: "Missing classId or academicYearId; cannot resolve a canonical class path.",
      });
      continue;
    }

    const classCacheKey = `${academicYearId}:${classId}`;
    const classSchoolPromise =
      classSchoolCache.get(classCacheKey) ??
      resolveSchoolFromClassPath({ academicYearId, classId });
    classSchoolCache.set(classCacheKey, classSchoolPromise);
    const matchingSchoolIds = await classSchoolPromise;

    if (matchingSchoolIds.length !== 1) {
      unresolved.push({
        ...baseRecord,
        reason:
          matchingSchoolIds.length === 0
            ? "No canonical kindergarten class path matched this lesson prep."
            : "More than one canonical kindergarten class path matched this lesson prep.",
      });
      continue;
    }

    proposedChanges.push({
      ...baseRecord,
      newSchoolId: matchingSchoolIds[0],
      resolutionSource: "CLASS_PATH",
      reference: prepDocument.ref,
    });
  }

  const printableChanges = proposedChanges.map(
    ({ reference: _reference, resolutionSource: _source, ...change }) => change,
  );
  console.log(
    JSON.stringify(
      {
        dryRun: !apply,
        submittedPrepsScanned: prepSnapshot.size,
        proposedChanges: printableChanges,
        unresolved,
      },
      null,
      2,
    ),
  );

  if (!apply) {
    console.log("Dry run only. Re-run with --apply to update schoolId values.");
    return;
  }

  const now = Date.now();
  for (const changeBatch of chunk(proposedChanges, 400)) {
    const batch = db.batch();
    for (const change of changeBatch) {
      batch.update(change.reference, {
        schoolId: change.newSchoolId,
        updatedAt: now,
      });
    }
    await batch.commit();
  }

  console.log(`Updated ${proposedChanges.length} legacy kindergarten lesson preps.`);
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
