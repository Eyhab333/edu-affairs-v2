#!/usr/bin/env node
/*
 * Reset selected Firebase Auth passwords to the supplied civil ID.
 *
 * Preview (default):
 *   node scripts/maintenance/reset-selected-user-passwords.cjs --serviceAccount=./service-account.json
 * Apply:
 *   node scripts/maintenance/reset-selected-user-passwords.cjs --serviceAccount=./service-account.json --apply
 *
 * The script intentionally never prints passwords.
 */

const fs = require("node:fs");
const path = require("node:path");
const admin = require("firebase-admin");

const accounts = [
  ["حمد زيد عبدالعزيز الناصر", "1010154001", "h-alnasser@qz.org.sa"],
  ["ناصر عبدالله عبدالعزيز الشايع", "1039829252", "n-alshaya@qz.org.sa"],
  ["منصور رميح حمود الرميح", "1037107958", "malrameh@qz.org.sa"],
  ["السيد محمد احمد احمد", "2581441991", "s.sayed@qz.org.sa"],
  ["اسماء محمد المنصور", "1057209494", "a-almansur@qz.org.sa"],
  ["فاطمة حماد الحماد", "1033963271", "f-alhamaad@qz.org.sa"],
  ["طيبة سليمان الطوالة", "1075840205", "t.altwala@qz.org.sa"],
  ["أحمد سليمان عبدالله الخميس", "1015814096", "a-s-alkmays@qz.org.sa"],
  ["رائد سليمان المطوع", "1078512264", "r.almutawa@qz.org.sa"],
  ["محمد صالح حمد العتيق", "1033349356", "m.alateeq@qz.org.sa"],
  ["قاسم محمد الفرهود", "1083400927", "q.alfrhud@qz.org.sa"],
  ["فهد محمد عبدالله القشعمي", "1081041509", "f.alqashami@qz.org.sa"],
  ["عبدالرحمن دخيل العواد", "1086619655", "a.d.alawad@qz.org.sa"],
  ["راشد سليمان فايز الفايز", "1092432416", "ralfaiz@qz.org.sa"],
  ["أيوب صالح عبدالكريم المطوع", "1094340971", "a.almotwa@qz.org.sa"],
].map(([name, civilId, email]) => ({ name, civilId, email }));

function arg(name) {
  const prefix = `--${name}=`;
  const value = process.argv.find((item) => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : null;
}

const apply = process.argv.includes("--apply");
const serviceAccountPath = arg("serviceAccount");
const projectId = arg("projectId");

if (serviceAccountPath) {
  const serviceAccount = JSON.parse(fs.readFileSync(path.resolve(serviceAccountPath), "utf8"));
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId: projectId || serviceAccount.project_id });
} else {
  admin.initializeApp({ credential: admin.credential.applicationDefault(), ...(projectId ? { projectId } : {}) });
}

async function main() {
  const auth = admin.auth();
  let updated = 0;
  let missing = 0;

  console.log(`${apply ? "Applying" : "Preview"} password reset for ${accounts.length} accounts`);

  for (const account of accounts) {
    try {
      const user = await auth.getUserByEmail(account.email);
      if (apply) {
        await auth.updateUser(user.uid, { password: account.civilId });
        updated += 1;
        console.log(`UPDATED ${account.email} (${account.name})`);
      } else {
        console.log(`MATCH  ${account.email} -> ${user.uid} (${account.name})`);
      }
    } catch (error) {
      if (error.code === "auth/user-not-found") {
        missing += 1;
        console.error(`MISSING ${account.email} (${account.name})`);
        continue;
      }
      throw error;
    }
  }

  console.log(`Completed. ${apply ? `Updated: ${updated}. ` : ""}Missing: ${missing}.`);
  if (!apply) console.log("No passwords were changed. Re-run with --apply to execute the reset.");
}

main().catch((error) => {
  console.error(`Failed: ${error.message}`);
  process.exitCode = 1;
});
