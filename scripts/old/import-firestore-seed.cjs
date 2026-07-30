#!/usr/bin/env node
/*
  Firestore seed importer (CommonJS)

  Usage examples:
    node import-firestore-seed.cjs ./edu_affairs_seed.json
    node import-firestore-seed.cjs ./edu_affairs_seed.json --serviceAccount=./service-account.json
    node import-firestore-seed.cjs ./edu_affairs_seed.json --serviceAccount=./service-account.json --projectId=my-project-id
    node import-firestore-seed.cjs ./edu_affairs_seed.json --dry-run

  Notes:
    - Default behavior uses merge:true for safety.
    - If --serviceAccount is omitted, the script tries application default credentials.
    - Seed JSON can be either:
      1) an array of documents
      2) an object containing a documents array
*/

const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

function parseArgs(argv) {
  const args = {
    seedPath: null,
    serviceAccount: null,
    projectId: null,
    dryRun: false,
    merge: true,
  };

  for (const arg of argv.slice(2)) {
    if (!arg.startsWith("--") && !args.seedPath) {
      args.seedPath = arg;
      continue;
    }

    if (arg === "--dry-run") {
      args.dryRun = true;
      continue;
    }

    if (arg === "--no-merge") {
      args.merge = false;
      continue;
    }

    if (arg.startsWith("--serviceAccount=")) {
      args.serviceAccount = arg.split("=")[1];
      continue;
    }

    if (arg.startsWith("--projectId=")) {
      args.projectId = arg.split("=")[1];
      continue;
    }
  }

  return args;
}

function exitWith(message) {
  console.error(`\n❌ ${message}\n`);
  process.exit(1);
}

function loadJson(filePath) {
  const absolutePath = path.resolve(process.cwd(), filePath);

  if (!fs.existsSync(absolutePath)) {
    exitWith(`Seed file not found: ${absolutePath}`);
  }

  try {
    return JSON.parse(fs.readFileSync(absolutePath, "utf8"));
  } catch (error) {
    exitWith(`Failed to parse JSON: ${error.message}`);
  }
}

function normalizeSeed(seed) {
  if (Array.isArray(seed)) {
    return { documents: seed };
  }

  if (seed && typeof seed === "object" && Array.isArray(seed.documents)) {
    return seed;
  }

  exitWith(
    "Seed JSON must be either an array of documents or an object containing a documents array."
  );
}

function validateSeed(seed) {
  for (let i = 0; i < seed.documents.length; i += 1) {
    const item = seed.documents[i];

    if (!item || typeof item !== "object") {
      exitWith(`documents[${i}] must be an object.`);
    }

    if (typeof item.path !== "string" || !item.path.trim()) {
      exitWith(`documents[${i}].path must be a non-empty string.`);
    }

    if (
      !item.data ||
      typeof item.data !== "object" ||
      Array.isArray(item.data)
    ) {
      exitWith(`documents[${i}].data must be an object.`);
    }
  }
}

function initFirebase({ serviceAccount, projectId }) {
  if (admin.apps.length > 0) {
    return admin.app();
  }

  let credential;

  if (serviceAccount) {
    const absoluteServiceAccountPath = path.resolve(
      process.cwd(),
      serviceAccount
    );

    if (!fs.existsSync(absoluteServiceAccountPath)) {
      exitWith(
        `Service account file not found: ${absoluteServiceAccountPath}`
      );
    }

    const serviceAccountJson = JSON.parse(
      fs.readFileSync(absoluteServiceAccountPath, "utf8")
    );
    credential = admin.credential.cert(serviceAccountJson);
  } else {
    credential = admin.credential.applicationDefault();
  }

  return admin.initializeApp({
    credential,
    ...(projectId ? { projectId } : {}),
  });
}

async function commitInChunks(db, documents, { merge }) {
  const chunkSize = 400;
  let totalCommitted = 0;

  for (let i = 0; i < documents.length; i += chunkSize) {
    const chunk = documents.slice(i, i + chunkSize);
    const batch = db.batch();

    for (const item of chunk) {
      const ref = db.doc(item.path);
      batch.set(ref, item.data, { merge });
    }

    await batch.commit();
    totalCommitted += chunk.length;
    console.log(`✅ Committed ${totalCommitted}/${documents.length}`);
  }
}

async function main() {
  const args = parseArgs(process.argv);

  if (!args.seedPath) {
    exitWith(
      "Usage: node import-firestore-seed.cjs <seed.json> [--serviceAccount=path] [--projectId=id] [--dry-run] [--no-merge]"
    );
  }

  const rawSeed = loadJson(args.seedPath);
  const seed = normalizeSeed(rawSeed);
  validateSeed(seed);

  console.log(`\n📦 Seed file loaded: ${args.seedPath}`);
  console.log(`📄 Documents count: ${seed.documents.length}`);
  console.log(`🛡️ Merge mode: ${args.merge ? "enabled" : "disabled"}`);

  if (args.dryRun) {
    console.log("\n🧪 Dry run only. No data was written.\n");
    return;
  }

  initFirebase(args);
  const db = admin.firestore();

  await commitInChunks(db, seed.documents, { merge: args.merge });

  console.log("\n🎉 Firestore seed import completed successfully.\n");
}

main().catch((error) => {
  console.error("\n❌ Import failed.");
  console.error(error);
  process.exit(1);
});