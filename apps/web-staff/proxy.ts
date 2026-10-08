import { NextRequest, NextResponse } from "next/server";

const MAINTENANCE_PATH = "/maintenance";

export function proxy(request: NextRequest) {
  if (process.env.MAINTENANCE_MODE !== "true") {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  // Keep the maintenance destination available and prevent a redirect loop.
  if (
    pathname === MAINTENANCE_PATH ||
    pathname.startsWith(MAINTENANCE_PATH + "/")
  ) {
    return NextResponse.next();
  }

  const maintenanceUrl = request.nextUrl.clone();
  maintenanceUrl.pathname = MAINTENANCE_PATH;
  return NextResponse.redirect(maintenanceUrl);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|_vercel|favicon.ico|apple-icon.png|icon0.svg|icon1.png|web-app-manifest-192x192.png|web-app-manifest-512x512.png|.*\\.(?:css|js|map|png|jpg|jpeg|gif|webp|avif|svg|ico|txt|xml|webmanifest|woff|woff2|ttf|otf)$).*)",
  ],
};
