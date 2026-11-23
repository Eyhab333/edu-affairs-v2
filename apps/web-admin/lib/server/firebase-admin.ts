import "server-only";

import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
  type App,
} from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function readEnvironment(name: string) {
  return process.env[name]?.trim() ?? "";
}

function getAdminApp(): App {
  const existing = getApps()[0];
  if (existing) return existing;

  const projectId =
    readEnvironment("FIREBASE_ADMIN_PROJECT_ID") ||
    readEnvironment("NEXT_PUBLIC_FIREBASE_PROJECT_ID");
  const clientEmail = readEnvironment("FIREBASE_ADMIN_CLIENT_EMAIL");
  const privateKey = readEnvironment("FIREBASE_ADMIN_PRIVATE_KEY").replace(
    /\\n/g,
    "\n",
  );

  if (projectId && clientEmail && privateKey) {
    return initializeApp({
      credential: cert({ projectId, clientEmail, privateKey }),
      projectId,
    });
  }

  return initializeApp({ credential: applicationDefault(), projectId });
}

const adminApp = getAdminApp();

export const adminAuth = getAuth(adminApp);
export const adminDb = getFirestore(adminApp);
