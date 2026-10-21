/**
 * Browser origins permitted to invoke the web-staff callable functions.
 * Keep this explicit so adding or replacing a web-staff deployment happens
 * once for every callable that shares this policy.
 */
export const WEB_STAFF_CORS_ORIGINS: string[] = [
  "http://localhost:3001",
  "https://edu-affairs-v2-web-staff.vercel.app",
  "https://takween-madar.vercel.app",
];
