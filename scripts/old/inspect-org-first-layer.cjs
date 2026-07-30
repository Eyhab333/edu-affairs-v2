/* eslint-disable no-console */

const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

function getArg(name, fallback = "") {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));

  return match ? match.slice(prefix.length).trim() : fallback;
}

function getBooleanArg(name, fallback = false) {
  const raw = getArg(name, "");

  if (!raw) return fallback;

  return ["true", "1", "yes", "y"].includes(raw.toLowerCase());
}

function getNumberArg(name, fallback) {
  const raw = Number(getArg(name, ""));

  return Number.isFinite(raw) && raw >= 0 ? raw : fallback;
}

const ORG_ID = getArg("org", process.env.ORG_ID || "takween");

const SAMPLE_SIZE = getNumberArg("sample", 3);
const SCAN_LIMIT = getNumberArg("scan-limit", 1000);
const PAGE_SIZE = Math.max(
  1,
  Math.min(getNumberArg("page-size", 200), 500),
);

const FULL_SCAN = getBooleanArg("full-scan", false);

const INSPECT_DOCUMENT_SUBCOLLECTIONS = getBooleanArg(
  "inspect-document-subcollections",
  true,
);

function resolveServiceAccountPath() {
  const candidates = [
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
    path.resolve(process.cwd(), "service-account.json"),
    path.resolve(process.cwd(), "scripts", "service-account.json"),
    path.resolve(__dirname, "service-account.json"),
  ].filter(Boolean);

  const found = candidates.find((candidate) =>
    fs.existsSync(candidate),
  );

  if (!found) {
    throw new Error(
      [
        "service-account.json not found.",
        "Checked:",
        ...candidates.map((candidate) => `- ${candidate}`),
      ].join("\n"),
    );
  }

  return found;
}

function initAdmin() {
  if (admin.apps.length > 0) return;

  const serviceAccountPath = resolveServiceAccountPath();

  const serviceAccount = JSON.parse(
    fs.readFileSync(serviceAccountPath, "utf8"),
  );

  if (
    serviceAccount.type !== "service_account" ||
    !serviceAccount.project_id ||
    !serviceAccount.client_email ||
    !serviceAccount.private_key
  ) {
    throw new Error(
      `Invalid service account file: ${serviceAccountPath}`,
    );
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });

  console.log("Firebase Admin initialized:", {
    projectId: serviceAccount.project_id,
    serviceAccountPath,
  });
}

function isTimestamp(value) {
  return (
    value &&
    typeof value.toDate === "function" &&
    typeof value.toMillis === "function"
  );
}

function isGeoPoint(value) {
  return (
    value &&
    typeof value.latitude === "number" &&
    typeof value.longitude === "number" &&
    value.constructor?.name === "GeoPoint"
  );
}

function isDocumentReference(value) {
  return (
    value &&
    typeof value.path === "string" &&
    value.firestore &&
    value.constructor?.name === "DocumentReference"
  );
}

function getValueType(value) {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (isTimestamp(value)) return "timestamp";
  if (isGeoPoint(value)) return "geopoint";
  if (isDocumentReference(value)) return "document_reference";
  if (Buffer.isBuffer(value)) return "buffer";
  if (value instanceof Date) return "date";
  if (Array.isArray(value)) return "array";

  return typeof value === "object"
    ? "object"
    : typeof value;
}

function serialize(value) {
  if (value === null || value === undefined) {
    return value;
  }

  if (isTimestamp(value)) {
    return {
      __type: "timestamp",
      iso: value.toDate().toISOString(),
      millis: value.toMillis(),
    };
  }

  if (isGeoPoint(value)) {
    return {
      __type: "geopoint",
      latitude: value.latitude,
      longitude: value.longitude,
    };
  }

  if (isDocumentReference(value)) {
    return {
      __type: "document_reference",
      path: value.path,
    };
  }

  if (Buffer.isBuffer(value)) {
    return {
      __type: "buffer",
      length: value.length,
    };
  }

  if (value instanceof Date) {
    return {
      __type: "date",
      iso: value.toISOString(),
    };
  }

  if (Array.isArray(value)) {
    return value.map(serialize);
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        serialize(item),
      ]),
    );
  }

  return value;
}

function incrementMapCount(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

function addFieldObservation(
  fieldMap,
  fieldPath,
  value,
  documentId,
) {
  const valueType = getValueType(value);

  if (!fieldMap.has(fieldPath)) {
    fieldMap.set(fieldPath, {
      path: fieldPath,
      occurrences: 0,
      types: new Map(),
      sampleDocumentIds: new Set(),
      arrayItemTypes: new Map(),
    });
  }

  const entry = fieldMap.get(fieldPath);

  entry.occurrences += 1;
  incrementMapCount(entry.types, valueType);

  if (entry.sampleDocumentIds.size < 10) {
    entry.sampleDocumentIds.add(documentId);
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      incrementMapCount(
        entry.arrayItemTypes,
        getValueType(item),
      );
    }
  }
}

function inspectObjectFields(
  fieldMap,
  value,
  documentId,
  parentPath = "",
) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    isTimestamp(value) ||
    isGeoPoint(value) ||
    isDocumentReference(value) ||
    Buffer.isBuffer(value) ||
    value instanceof Date
  ) {
    return;
  }

  for (const [key, childValue] of Object.entries(value)) {
    const fieldPath = parentPath
      ? `${parentPath}.${key}`
      : key;

    addFieldObservation(
      fieldMap,
      fieldPath,
      childValue,
      documentId,
    );

    if (
      childValue &&
      typeof childValue === "object" &&
      !Array.isArray(childValue) &&
      !isTimestamp(childValue) &&
      !isGeoPoint(childValue) &&
      !isDocumentReference(childValue) &&
      !Buffer.isBuffer(childValue) &&
      !(childValue instanceof Date)
    ) {
      inspectObjectFields(
        fieldMap,
        childValue,
        documentId,
        fieldPath,
      );
    }

    if (Array.isArray(childValue)) {
      childValue.forEach((arrayItem, index) => {
        if (
          arrayItem &&
          typeof arrayItem === "object" &&
          !Array.isArray(arrayItem) &&
          !isTimestamp(arrayItem) &&
          !isGeoPoint(arrayItem) &&
          !isDocumentReference(arrayItem) &&
          !Buffer.isBuffer(arrayItem) &&
          !(arrayItem instanceof Date)
        ) {
          inspectObjectFields(
            fieldMap,
            arrayItem,
            documentId,
            `${fieldPath}[]`,
          );
        }
      });
    }
  }
}

function mapToSortedObject(map) {
  return Object.fromEntries(
    [...map.entries()].sort(([a], [b]) =>
      a.localeCompare(b),
    ),
  );
}

function buildFieldInventory(fieldMap, scannedDocuments) {
  return [...fieldMap.values()]
    .map((entry) => ({
      path: entry.path,
      occurrences: entry.occurrences,
      occurrencePercentage:
        scannedDocuments > 0
          ? Number(
              (
                (entry.occurrences / scannedDocuments) *
                100
              ).toFixed(2),
            )
          : 0,
      types: mapToSortedObject(entry.types),
      arrayItemTypes: mapToSortedObject(
        entry.arrayItemTypes,
      ),
      sampleDocumentIds: [
        ...entry.sampleDocumentIds,
      ].sort(),
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

function isLikelyLinkingField(fieldPath) {
  const leaf = fieldPath
    .split(".")
    .at(-1)
    ?.replace("[]", "");

  if (!leaf) return false;

  return (
    leaf === "id" ||
    leaf === "uid" ||
    leaf === "email" ||
    leaf === "role" ||
    leaf === "roleKey" ||
    leaf === "orgId" ||
    leaf === "personId" ||
    leaf === "membershipId" ||
    leaf === "schoolId" ||
    leaf === "academicYearId" ||
    leaf === "termId" ||
    leaf === "gradeId" ||
    leaf === "classId" ||
    leaf === "studentId" ||
    leaf === "guardianId" ||
    leaf === "routeId" ||
    leaf === "actorPersonId" ||
    leaf === "targetPersonId" ||
    leaf === "teacherPersonId" ||
    leaf === "supervisorPersonId" ||
    leaf.endsWith("Ids") ||
    leaf.endsWith("Id")
  );
}

async function getCollectionCount(collectionRef) {
  try {
    const countSnap = await collectionRef.count().get();

    return countSnap.data().count;
  } catch (error) {
    console.warn(
      `Count aggregation failed for ${collectionRef.path}; falling back to full get.`,
    );

    const snap = await collectionRef.get();

    return snap.size;
  }
}

async function loadCollectionSample(
  collectionRef,
  sampleSize,
) {
  if (sampleSize <= 0) return [];

  const snap = await collectionRef
    .orderBy(admin.firestore.FieldPath.documentId())
    .limit(sampleSize)
    .get();

  return snap.docs;
}

async function inspectDocumentSubcollections(
  documentSnapshot,
) {
  if (!INSPECT_DOCUMENT_SUBCOLLECTIONS) {
    return [];
  }

  const subcollections =
    await documentSnapshot.ref.listCollections();

  return subcollections
    .map((collection) => ({
      id: collection.id,
      path: collection.path,
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

async function scanCollection(collectionRef) {
  const fieldMap = new Map();
  const topLevelFieldCounts = new Map();

  let scannedDocuments = 0;
  let lastDocument = null;
  let reachedEnd = false;

  const effectiveLimit = FULL_SCAN
    ? Number.POSITIVE_INFINITY
    : SCAN_LIMIT;

  while (
    !reachedEnd &&
    scannedDocuments < effectiveLimit
  ) {
    const remaining = Number.isFinite(effectiveLimit)
      ? effectiveLimit - scannedDocuments
      : PAGE_SIZE;

    const currentPageSize = Math.max(
      1,
      Math.min(PAGE_SIZE, remaining),
    );

    let query = collectionRef
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(currentPageSize);

    if (lastDocument) {
      query = query.startAfter(lastDocument);
    }

    const snap = await query.get();

    if (snap.empty) {
      reachedEnd = true;
      break;
    }

    for (const doc of snap.docs) {
      const data = doc.data();

      scannedDocuments += 1;

      for (const fieldName of Object.keys(data)) {
        incrementMapCount(
          topLevelFieldCounts,
          fieldName,
        );
      }

      inspectObjectFields(
        fieldMap,
        data,
        doc.id,
      );

      if (scannedDocuments >= effectiveLimit) {
        break;
      }
    }

    lastDocument = snap.docs.at(-1);

    if (snap.size < currentPageSize) {
      reachedEnd = true;
    }
  }

  const fieldInventory = buildFieldInventory(
    fieldMap,
    scannedDocuments,
  );

  return {
    scannedDocuments,
    scanComplete: reachedEnd,
    topLevelFields: [...topLevelFieldCounts.entries()]
      .map(([field, occurrences]) => ({
        field,
        occurrences,
        occurrencePercentage:
          scannedDocuments > 0
            ? Number(
                (
                  (occurrences / scannedDocuments) *
                  100
                ).toFixed(2),
              )
            : 0,
      }))
      .sort((a, b) => a.field.localeCompare(b.field)),
    fieldInventory,
    likelyLinkingFields: fieldInventory.filter((field) =>
      isLikelyLinkingField(field.path),
    ),
  };
}

async function inspectCollection(collectionRef) {
  console.log(`\nInspecting: ${collectionRef.path}`);

  const totalDocuments =
    await getCollectionCount(collectionRef);

  const [sampleDocs, scanResult] = await Promise.all([
    loadCollectionSample(
      collectionRef,
      SAMPLE_SIZE,
    ),
    scanCollection(collectionRef),
  ]);

  const sampleDocuments = [];

  for (const doc of sampleDocs) {
    sampleDocuments.push({
      id: doc.id,
      path: doc.ref.path,
      data: serialize(doc.data()),
      directSubcollections:
        await inspectDocumentSubcollections(doc),
    });
  }

  console.log(
    `  total=${totalDocuments} scanned=${scanResult.scannedDocuments} fields=${scanResult.fieldInventory.length}`,
  );

  return {
    id: collectionRef.id,
    path: collectionRef.path,
    totalDocuments,
    scannedDocuments: scanResult.scannedDocuments,
    scanComplete:
      scanResult.scanComplete ||
      scanResult.scannedDocuments >= totalDocuments,
    topLevelFields: scanResult.topLevelFields,
    fieldInventory: scanResult.fieldInventory,
    likelyLinkingFields:
      scanResult.likelyLinkingFields,
    sampleDocuments,
  };
}

function createOutputPath() {
  const reportsDir = path.resolve(
    process.cwd(),
    "reports",
  );

  fs.mkdirSync(reportsDir, {
    recursive: true,
  });

  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-");

  return path.join(
    reportsDir,
    `inspect-org-${ORG_ID}-first-layer-${timestamp}.json`,
  );
}

function printCollectionSummary(collections) {
  console.log(
    "\n==================================================",
  );
  console.log("FIRST-LAYER COLLECTION SUMMARY");
  console.log(
    "==================================================",
  );

  for (const collection of collections) {
    console.log(
      [
        collection.id.padEnd(45),
        `documents=${String(
          collection.totalDocuments,
        ).padEnd(8)}`,
        `scanned=${String(
          collection.scannedDocuments,
        ).padEnd(8)}`,
        `fields=${collection.fieldInventory.length}`,
      ].join(" "),
    );
  }
}

async function main() {
  initAdmin();

  const db = admin.firestore();
  const orgRef = db.doc(`orgs/${ORG_ID}`);

  console.log(
    "\nRunning first-layer organization inspection.",
  );
  console.log("No Firestore writes will be performed.");
  console.log({
    orgId: ORG_ID,
    sampleSize: SAMPLE_SIZE,
    scanLimit: FULL_SCAN ? "FULL" : SCAN_LIMIT,
    pageSize: PAGE_SIZE,
    inspectDocumentSubcollections:
      INSPECT_DOCUMENT_SUBCOLLECTIONS,
  });

  const orgSnap = await orgRef.get();

  if (!orgSnap.exists) {
    throw new Error(
      `Organization not found: ${orgRef.path}`,
    );
  }

  const directCollections =
    await orgRef.listCollections();

  directCollections.sort((a, b) =>
    a.id.localeCompare(b.id),
  );

  console.log(
    `\nFound ${directCollections.length} direct collections under ${orgRef.path}.`,
  );

  const collections = [];

  // متعمد أن يكون بالتتابع حتى لا نضغط على Firestore.
  for (const collectionRef of directCollections) {
    collections.push(
      await inspectCollection(collectionRef),
    );
  }

  const report = {
    metadata: {
      generatedAt: new Date().toISOString(),
      projectId: admin.app().options.projectId,
      orgId: ORG_ID,
      orgPath: orgRef.path,
      mode: FULL_SCAN
        ? "FULL_SCAN"
        : "LIMITED_SCAN",
      sampleSize: SAMPLE_SIZE,
      scanLimit: FULL_SCAN ? null : SCAN_LIMIT,
      pageSize: PAGE_SIZE,
      inspectDocumentSubcollections:
        INSPECT_DOCUMENT_SUBCOLLECTIONS,
      firestoreWritesPerformed: false,
    },

    organizationDocument: {
      id: orgSnap.id,
      path: orgSnap.ref.path,
      data: serialize(orgSnap.data()),
    },

    summary: {
      directCollectionCount: collections.length,
      directCollectionIds: collections.map(
        (collection) => collection.id,
      ),
      totalFirstLayerDocuments: collections.reduce(
        (sum, collection) =>
          sum + collection.totalDocuments,
        0,
      ),
      totalScannedDocuments: collections.reduce(
        (sum, collection) =>
          sum + collection.scannedDocuments,
        0,
      ),
    },

    collections,
  };

  const outputPath = createOutputPath();

  fs.writeFileSync(
    outputPath,
    JSON.stringify(report, null, 2),
    "utf8",
  );

  printCollectionSummary(collections);

  console.log(
    "\n==================================================",
  );
  console.log("REPORT");
  console.log(
    "==================================================",
  );
  console.log(`Saved to: ${outputPath}`);
  console.log(
    "✅ انتهى الفحص دون أي كتابة داخل Firestore.",
  );
}

main().catch((error) => {
  console.error("\n❌ فشل فحص المؤسسة:");
  console.error(error);
  process.exit(1);
});