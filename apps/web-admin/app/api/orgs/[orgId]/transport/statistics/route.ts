import { NextRequest, NextResponse } from "next/server";

import { adminAuth, adminDb } from "@/lib/server/firebase-admin";
import {
  buildTransportStatisticsReport,
  loadTransportAcademicYears,
  type TransportStatisticsMode,
} from "@/lib/server/transport-statistics";
import { buildTransportStatisticsWorkbook } from "@/lib/server/transport-statistics-xlsx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

class RouteError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

function readSafeId(value: string, fieldName: string) {
  const id = value.trim();
  if (!id || id.includes("/")) throw new RouteError(400, `${fieldName} غير صالح.`);
  return id;
}

function readBearerToken(request: NextRequest) {
  const match = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "");
  if (!match?.[1]) throw new RouteError(401, "يلزم تسجيل الدخول للوصول إلى تقرير النقل.");
  return match[1];
}

function isActiveOrgAdmin(membership: Record<string, unknown>) {
  const active = membership.isActive === true || membership.active === true;
  const roleKey =
    (typeof membership.roleKey === "string" && membership.roleKey.trim()) ||
    (typeof membership.role === "string" && membership.role.trim()) ||
    "";
  return active && ["platform_owner", "platform_admin", "org_owner", "org_admin"].includes(roleKey);
}

async function requireOrgAdmin(request: NextRequest, orgId: string) {
  let uid = "";
  try {
    uid = (await adminAuth.verifyIdToken(readBearerToken(request))).uid;
  } catch (error) {
    if (error instanceof RouteError) throw error;
    throw new RouteError(401, "انتهت صلاحية الجلسة أو تعذر التحقق منها.");
  }

  const membershipSnapshot = await adminDb.doc(`users/${uid}/orgMemberships/${orgId}`).get();
  const membership = membershipSnapshot.data() as Record<string, unknown> | undefined;
  if (!membershipSnapshot.exists || !membership || !isActiveOrgAdmin(membership)) {
    throw new RouteError(403, "لا تملك صلاحية عرض تقرير النقل لهذه المؤسسة.");
  }
}

function reportFileName(mode: TransportStatisticsMode, academicYearId: string) {
  return mode === "current"
    ? "transport-statistics-current.xlsx"
    : `transport-statistics-${academicYearId}.xlsx`;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ orgId: string }> },
) {
  try {
    const { orgId: routeOrgId } = await context.params;
    const orgId = readSafeId(routeOrgId, "معرّف المؤسسة");
    await requireOrgAdmin(request, orgId);

    const searchParams = request.nextUrl.searchParams;
    const mode = searchParams.get("mode") ?? "";
    const format = searchParams.get("format") ?? "json";

    if (mode === "metadata") {
      if (format !== "json") throw new RouteError(400, "صيغة metadata يجب أن تكون json.");
      const academicYears = await loadTransportAcademicYears({ db: adminDb, orgId });
      return NextResponse.json({ academicYears }, { headers: { "cache-control": "no-store" } });
    }
    if (mode !== "current" && mode !== "year") throw new RouteError(400, "وضع التقرير غير صالح.");
    if (format !== "json" && format !== "xlsx") throw new RouteError(400, "صيغة التصدير غير صالحة.");

    const academicYearId = mode === "year"
      ? readSafeId(searchParams.get("academicYearId") ?? "", "السنة الدراسية")
      : "";
    const report = await buildTransportStatisticsReport({
      db: adminDb,
      orgId,
      mode,
      academicYearId,
    });

    if (format === "json") {
      return NextResponse.json(report, { headers: { "cache-control": "no-store" } });
    }

    const workbook = await buildTransportStatisticsWorkbook(report);
    return new NextResponse(workbook, {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${reportFileName(mode, academicYearId)}"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof RouteError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof Error && error.message === "ACADEMIC_YEAR_NOT_FOUND") {
      return NextResponse.json({ error: "السنة الدراسية المحددة غير متاحة في هذه المؤسسة." }, { status: 404 });
    }
    if (error instanceof Error && error.message === "ACADEMIC_YEAR_REQUIRED") {
      return NextResponse.json({ error: "اختر سنة دراسية لعرض تقريرها." }, { status: 400 });
    }

    console.error("Unable to build transport statistics", error);
    return NextResponse.json({ error: "تعذر إنشاء تقرير النقل. حاول مرة أخرى." }, { status: 500 });
  }
}
