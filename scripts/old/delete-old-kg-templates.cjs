const admin = require("firebase-admin");
const path = require("path");
const fs = require("fs");

const serviceAccount = require(path.join(__dirname, "./service-account.json"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const orgId = process.env.ORG_ID || "takween";
const dryRun = process.argv.includes("--dry-run");

const reportPath = path.join(__dirname, "inspect-kg-templates-report.json");

function loadReport() {
  if (!fs.existsSync(reportPath)) {
    throw new Error(
      `Report file not found: ${reportPath}. Run inspect-kg-templates.cjs first.`,
    );
  }

  return JSON.parse(fs.readFileSync(reportPath, "utf8"));
}

async function main() {
  const startedAt = Date.now();

  const report = loadReport();

  const kgCandidates = Array.isArray(report.kgCandidates)
    ? report.kgCandidates
    : [];

  const targets = kgCandidates.filter((item) => {
    // لا نحذف أي قالب ابتدائي حتى لو دخل التقرير بالخطأ.
    if (String(item.schoolType || "").toUpperCase() === "PRIMARY") {
      return false;
    }

    if (String(item.id || "").startsWith("primary-")) {
      return false;
    }

    return ["studentAssessmentTemplates", "studentTrackerTemplates"].includes(
      item.collectionName,
    );
  });

  const result = {
    orgId,
    dryRun,
    scanned: kgCandidates.length,
    targets: targets.length,
    deleted: [],
    skippedMissing: [],
  };

  console.log("Deleting old KG templates...");
  console.log({
    orgId,
    dryRun,
    scanned: result.scanned,
    targets: result.targets,
  });

  for (const item of targets) {
    const ref = db
      .collection("orgs")
      .doc(orgId)
      .collection(item.collectionName)
      .doc(item.id);

    const snap = await ref.get();

    if (!snap.exists) {
      result.skippedMissing.push({
        collectionName: item.collectionName,
        id: item.id,
      });

      console.log(`SKIP missing ${item.collectionName}/${item.id}`);
      continue;
    }

    if (!dryRun) {
      await ref.delete();
    }

    result.deleted.push({
      collectionName: item.collectionName,
      id: item.id,
      title: item.title || "",
    });

    console.log(
      `${dryRun ? "DRY RUN delete" : "DELETED"} ${item.collectionName}/${item.id} — ${item.title || ""}`,
    );
  }

  const finishedAt = Date.now();

  console.log("Done.");
  console.log({
    orgId: result.orgId,
    dryRun: result.dryRun,
    scanned: result.scanned,
    targets: result.targets,
    deleted: result.deleted.length,
    skippedMissing: result.skippedMissing.length,
    durationMs: finishedAt - startedAt,
  });

  const outputPath = path.join(
    __dirname,
    "delete-old-kg-templates-result.json",
  );

  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), "utf8");

  console.log("Result written to:");
  console.log(outputPath);
}

main().catch((error) => {
  console.error("Failed to delete old KG templates.");
  console.error(error);
  process.exit(1);
});