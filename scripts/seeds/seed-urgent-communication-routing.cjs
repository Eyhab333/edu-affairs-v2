const admin = require("firebase-admin");
const fs = require("node:fs");
const path = require("node:path");

const APPLY = process.argv.includes("--apply");

const orgId = "takween";

const routingBySchool = {
  "mrb-boys-sayh": {
    COUNSELOR: {
      uid: "FLC6Mymy87PVqo4OR7EIJGZtZdx1",
      personId: "p-students-mentor-syeh",
      roleKey: "BOYS_STUDENT_GUIDE",
      displayName: "الموجه الطلابي - السيح",
    },
    PRINCIPAL: {
      uid: "ZsxqcyMToKRzvp9ZC94zsiW1apC2",
      personId: "p-a-s-alkmays",
      roleKey: "BOYS_PRINCIPAL",
      displayName: "أحمد سليمان الخميس",
    },
    SUPERVISION_HEAD: {
      uid: "atmGJJCwkIZdJHarm9gL0WYLCyQ2",
      personId: "p-h-alnasser",
      roleKey: "ORG_SUPERVISION_HEAD",
      displayName: "حمد زيد الناصر",
    },
  },

  "mrb-boys-faleh": {
    COUNSELOR: {
      uid: "gm37B5cNxxUyIasU9G70zHgVkEj2",
      personId: "staff-gm37B5cNxxUyIasU9G70zHgVkEj2",
      roleKey: "BOYS_STUDENT_GUIDE",
      displayName: "الموجه الطلابي - الفالح",
    },
    PRINCIPAL: {
      uid: "EJP7cQWlOldemQo6R6TciBZXSFt2",
      personId: "staff-EJP7cQWlOldemQo6R6TciBZXSFt2",
      roleKey: "BOYS_PRINCIPAL",
      displayName: "عبدالعزيز عثمان العثمان",
    },
    SUPERVISION_HEAD: {
      uid: "atmGJJCwkIZdJHarm9gL0WYLCyQ2",
      personId: "p-h-alnasser",
      roleKey: "ORG_SUPERVISION_HEAD",
      displayName: "حمد زيد الناصر",
    },
  },

  "mrb-girls": {
    COUNSELOR: {
      uid: "Ivr7RIb0AoWIuKAgQTcK0LzKRCz1",
      personId: "staff-Ivr7RIb0AoWIuKAgQTcK0LzKRCz1",
      roleKey: "GIRLS_STUDENT_GUIDE",
      displayName: "ساره ناصر محمد الحمد",
    },
    PRINCIPAL: {
      uid: "okMSrTs9InbKydR0XGo90ZaBqJC2",
      personId: "p-n-albader",
      roleKey: "GIRLS_PRINCIPAL",
      displayName: "نادية عثمان البدر",
    },
    SUPERVISION_HEAD: {
      uid: "atmGJJCwkIZdJHarm9gL0WYLCyQ2",
      personId: "p-h-alnasser",
      roleKey: "ORG_SUPERVISION_HEAD",
      displayName: "حمد زيد الناصر",
    },
  },
};

function resolveServiceAccountPath() {
  const candidates = [
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
    path.resolve(process.cwd(), "scripts/service-account.json"),
  ].filter(Boolean);

  return candidates.find((candidate) => fs.existsSync(candidate)) || "";
}

function initializeFirebaseAdmin() {
  if (admin.apps.length > 0) return;

  const serviceAccountPath = resolveServiceAccountPath();

  if (serviceAccountPath) {
    const serviceAccount = JSON.parse(
      fs.readFileSync(serviceAccountPath, "utf8"),
    );

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id,
    });

    console.log("Using service account:", serviceAccountPath);
    return;
  }

  admin.initializeApp({
    projectId: process.env.GOOGLE_CLOUD_PROJECT || "edu-affairs-dev",
  });

  console.log("Using application default credentials");
}

function cleanAssignee(assignee) {
  return {
    uid: String(assignee.uid || "").trim(),
    personId: String(assignee.personId || "").trim(),
    roleKey: String(assignee.roleKey || "").trim(),
    displayName: String(assignee.displayName || "").trim(),
  };
}

function cleanRouting(routing) {
  return {
    COUNSELOR: cleanAssignee(routing.COUNSELOR),
    PRINCIPAL: cleanAssignee(routing.PRINCIPAL),
    SUPERVISION_HEAD: cleanAssignee(routing.SUPERVISION_HEAD),
  };
}

function validateRouting(schoolId, routing) {
  const levels = ["COUNSELOR", "PRINCIPAL", "SUPERVISION_HEAD"];

  for (const level of levels) {
    const assignee = routing[level];

    for (const field of ["uid", "personId", "roleKey", "displayName"]) {
      if (!assignee[field]) {
        throw new Error(`${schoolId}.${level}.${field} is required`);
      }
    }
  }
}

async function main() {
  initializeFirebaseAdmin();

  const db = admin.firestore();
  const now = Date.now();

  console.log(APPLY ? "Mode: APPLY" : "Mode: DRY RUN");

  const entries = Object.entries(routingBySchool);

  for (const [schoolId, rawRouting] of entries) {
    const routing = cleanRouting(rawRouting);
    validateRouting(schoolId, routing);

    const ref = db.doc(
      `orgs/${orgId}/urgentCommunicationRouting/${schoolId}`,
    );

    const payload = {
      ...routing,
      orgId,
      schoolId,
      updatedAt: now,
    };

    console.log("\n==============================");
    console.log(ref.path);
    console.log(JSON.stringify(payload, null, 2));

    if (APPLY) {
      await ref.set(payload, { merge: true });
      console.log("✅ Written");
    } else {
      console.log("DRY RUN only. Add --apply to write.");
    }
  }

  console.log("\nDone.");
}

main().catch((error) => {
  console.error("Failed to seed urgent communication routing");
  console.error(error);
  process.exit(1);
});