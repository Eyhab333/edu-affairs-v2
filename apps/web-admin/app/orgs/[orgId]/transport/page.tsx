"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  AlertTriangle,
  Bus,
  Edit3,
  Loader2,
  MapPin,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  UserRoundCheck,
} from "lucide-react";
import { toast } from "sonner";

import type {
  StudentTransportEnrollment,
  TransportRoute,
  TransportRouteStop,
  TransportVehicle,
} from "@takween/contracts";

import PageHero from "@/components/shared/PageHero";
import FormSection from "@/components/shared/FormSection";
import InfoCard from "@/components/shared/InfoCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRequireAuth } from "@/hooks/use-require-auth";
import {
  bulkEnrollTransportStudents,
  getTransportAdminWorkspace,
  mutateTransportAdministration,
  searchTransportAdminEmployees,
  searchTransportAdminStudents,
  transportAdminErrorMessage,
  type TransportAdminAction,
  type TransportAdminEmployee,
  type TransportAdminWorkspace,
  type TransportStudentSearchRow,
} from "@/lib/transport-administration";

type TabKey = "DASHBOARD" | "ROUTES" | "VEHICLES" | "SUPERVISORS" | "ENROLLMENTS" | "STOPS";

const inputClass = "h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";
const textareaClass = "min-h-20 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

function riyadhDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function dateMs(value: string, endOfDay = false) {
  if (!value) return undefined;
  return Date.parse(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00"}+03:00`);
}

function dateInput(timestamp?: number) {
  if (!timestamp) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestamp));
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function statusLabel(status: string) {
  switch (status) {
    case "ACTIVE": return "نشط";
    case "INACTIVE": return "غير نشط";
    case "MAINTENANCE": return "صيانة";
    case "ARCHIVED": return "مؤرشف";
    case "PAUSED": return "متوقف مؤقتًا";
    case "ENDED": return "منتهي";
    case "CANCELLED": return "ملغى";
    default: return status;
  }
}

function newVehicleDraft() {
  return { id: "", title: "", code: "", plateNumber: "", model: "", capacity: "", status: "ACTIVE", notes: "" };
}

function newRouteDraft() {
  return { id: "", schoolId: "", academicYearId: "", title: "", code: "", shortTitle: "", vehicleId: "", status: "ACTIVE", areaLabel: "", startsFromLabel: "", endsAtLabel: "", description: "", order: "" };
}

function newStopDraft() {
  return { id: "", routeId: "", title: "", kind: "BOTH", order: "", areaLabel: "", addressText: "", estimatedMorningTime: "", estimatedAfternoonTime: "", description: "" };
}

export default function TransportAdministrationPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const { user, checkingAuth } = useRequireAuth();
  const [workspace, setWorkspace] = useState<TransportAdminWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<TabKey>("DASHBOARD");
  const [search, setSearch] = useState("");
  const [schoolFilter, setSchoolFilter] = useState("");
  const [vehicleDraft, setVehicleDraft] = useState(newVehicleDraft);
  const [routeDraft, setRouteDraft] = useState(newRouteDraft);
  const [stopDraft, setStopDraft] = useState(newStopDraft);
  const [supervisorRouteId, setSupervisorRouteId] = useState("");
  const [selectedSupervisors, setSelectedSupervisors] = useState<Set<string>>(new Set());
  const [supervisorQuery, setSupervisorQuery] = useState("");
  const [supervisorSchoolId, setSupervisorSchoolId] = useState("");
  const [supervisorPosition, setSupervisorPosition] = useState("");
  const [supervisorAssignmentStatus, setSupervisorAssignmentStatus] = useState<"ALL" | "ASSIGNED" | "UNASSIGNED">("ALL");
  const [employeeResults, setEmployeeResults] = useState<TransportAdminEmployee[]>([]);
  const [employeeCursor, setEmployeeCursor] = useState<string | undefined>();
  const [searchingEmployees, setSearchingEmployees] = useState(false);
  const [studentSchoolId, setStudentSchoolId] = useState("");
  const [studentClassId, setStudentClassId] = useState("");
  const [studentQuery, setStudentQuery] = useState("");
  const [studentResults, setStudentResults] = useState<TransportStudentSearchRow[]>([]);
  const [searchingStudents, setSearchingStudents] = useState(false);
  const [selectedStudents, setSelectedStudents] = useState<Record<string, TransportStudentSearchRow>>({});
  const [bulkEnrolling, setBulkEnrolling] = useState(false);
  const [bulkResult, setBulkResult] = useState<{
    succeeded: string[];
    skipped: Array<{ studentId: string; code: string; message: string }>;
  } | null>(null);
  const [enrollmentRouteId, setEnrollmentRouteId] = useState("");
  const [pickupStopId, setPickupStopId] = useState("");
  const [dropoffStopId, setDropoffStopId] = useState("");
  const [startsAt, setStartsAt] = useState(riyadhDate);
  const [endsAt, setEndsAt] = useState("");
  const [enrollmentNotes, setEnrollmentNotes] = useState("");
  const [transferEnrollment, setTransferEnrollment] = useState<StudentTransportEnrollment | null>(null);
  const [transferRouteId, setTransferRouteId] = useState("");
  const [transferDate, setTransferDate] = useState(riyadhDate);

  const load = useCallback(async () => {
    if (!orgId || !user) return;
    setLoading(true);
    setError(null);
    try {
      setWorkspace(await getTransportAdminWorkspace(orgId));
    } catch (loadError) {
      setError(transportAdminErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [orgId, user]);

  useEffect(() => { void load(); }, [load]);

  async function mutate(action: TransportAdminAction, payload: Record<string, unknown>, success: string) {
    setBusy(true);
    try {
      await mutateTransportAdministration({ orgId, action, payload });
      toast.success(success);
      await load();
      return true;
    } catch (mutationError) {
      toast.error(transportAdminErrorMessage(mutationError));
      return false;
    } finally {
      setBusy(false);
    }
  }

  const activeEnrollments = useMemo(
    () => (workspace?.enrollments ?? []).filter((item) => item.status === "ACTIVE" || item.status === "PAUSED"),
    [workspace?.enrollments],
  );
  const staffById = useMemo(
    () => new Map((workspace?.staff ?? []).map((item) => [item.personId, item])),
    [workspace?.staff],
  );
  const vehicleById = useMemo(
    () => new Map((workspace?.vehicles ?? []).map((item) => [item.id, item])),
    [workspace?.vehicles],
  );

  function routeSupervisorIds(route: TransportRoute) {
    return Array.from(new Set([
      ...(route.supervisorPersonIds ?? []),
      ...(workspace?.assignments ?? [])
        .filter((assignment) => assignment.scopeId === route.id && assignment.status === "ACTIVE" && assignment.isActive)
        .map((assignment) => assignment.actorPersonId),
    ].filter(Boolean)));
  }

  const warnings = useMemo(() => {
    if (!workspace) return [];
    const items: string[] = [];
    workspace.routes.filter((route) => route.status === "ACTIVE").forEach((route) => {
      const supervisors = new Set([
        ...(route.supervisorPersonIds ?? []),
        ...workspace.assignments
          .filter((assignment) => assignment.scopeId === route.id && assignment.status === "ACTIVE" && assignment.isActive)
          .map((assignment) => assignment.actorPersonId),
      ]);
      if (!supervisors.size) items.push(`الخط «${route.title}» بلا مشرف نشط.`);
      if (!route.vehicleId) items.push(`الخط «${route.title}» بلا مركبة.`);
      const vehicle = route.vehicleId ? workspace.vehicles.find((item) => item.id === route.vehicleId) : undefined;
      if (vehicle?.status === "MAINTENANCE") items.push(`مركبة الخط «${route.title}» تحت الصيانة.`);
      const count = workspace.enrollments.filter((item) => item.routeId === route.id && ["ACTIVE", "PAUSED"].includes(item.status)).length;
      if (vehicle?.capacity !== undefined && count > vehicle.capacity) items.push(`عدد طلاب «${route.title}» يتجاوز سعة المركبة.`);
    });
    workspace.enrollments.filter((item) => ["ACTIVE", "PAUSED"].includes(item.status)).forEach((item) => {
      const route = workspace.routes.find((candidate) => candidate.id === item.routeId);
      if (!route || route.status !== "ACTIVE") items.push(`اشتراك الطالب ${item.studentDisplayName ?? item.studentId} مرتبط بخط غير نشط.`);
    });
    return items;
  }, [workspace]);

  const filteredRoutes = (workspace?.routes ?? []).filter((route) => {
    if (schoolFilter && route.schoolId !== schoolFilter) return false;
    const needle = search.trim().toLocaleLowerCase("ar");
    return !needle || route.title.toLocaleLowerCase("ar").includes(needle) || route.id.toLocaleLowerCase().includes(needle);
  });

  const supervisorGroups = useMemo(() => {
    if (!workspace) return [];
    const groups = new Map<string, TransportRoute[]>();
    workspace.routes.filter((route) => route.status !== "ARCHIVED").forEach((route) => {
      const ids = Array.from(new Set([
        ...(route.supervisorPersonIds ?? []),
        ...workspace.assignments
          .filter((assignment) => assignment.scopeId === route.id && assignment.status === "ACTIVE" && assignment.isActive)
          .map((assignment) => assignment.actorPersonId),
      ])).filter(Boolean);
      (ids.length ? ids : ["UNASSIGNED"]).forEach((personId) => {
        groups.set(personId, [...(groups.get(personId) ?? []), route]);
      });
    });
    return Array.from(groups.entries()).sort(([left], [right]) => {
      if (left === "UNASSIGNED") return 1;
      if (right === "UNASSIGNED") return -1;
      return (staffById.get(left)?.displayName ?? left).localeCompare(staffById.get(right)?.displayName ?? right, "ar");
    });
  }, [staffById, workspace]);

  function editVehicle(vehicle: TransportVehicle) {
    setVehicleDraft({
      id: vehicle.id,
      title: vehicle.title,
      code: vehicle.code ?? "",
      plateNumber: vehicle.plateNumber ?? "",
      model: vehicle.model ?? "",
      capacity: vehicle.capacity?.toString() ?? "",
      status: vehicle.status,
      notes: vehicle.notes ?? "",
    });
  }

  function editRoute(route: TransportRoute) {
    setRouteDraft({
      id: route.id,
      schoolId: route.schoolId ?? "",
      academicYearId: route.academicYearId ?? "",
      title: route.title,
      code: route.code ?? "",
      shortTitle: route.shortTitle ?? "",
      vehicleId: route.vehicleId ?? "",
      status: route.status,
      areaLabel: route.areaLabel ?? "",
      startsFromLabel: route.startsFromLabel ?? "",
      endsAtLabel: route.endsAtLabel ?? "",
      description: route.description ?? "",
      order: route.order?.toString() ?? "",
    });
  }

  function editStop(stop: TransportRouteStop) {
    setStopDraft({
      id: stop.id,
      routeId: stop.routeId,
      title: stop.title,
      kind: stop.kind,
      order: stop.order?.toString() ?? "",
      areaLabel: stop.areaLabel ?? "",
      addressText: stop.addressText ?? "",
      estimatedMorningTime: stop.estimatedMorningTime ?? "",
      estimatedAfternoonTime: stop.estimatedAfternoonTime ?? "",
      description: stop.description ?? "",
    });
  }

  function chooseSupervisorRoute(routeId: string) {
    setSupervisorRouteId(routeId);
    const route = workspace?.routes.find((item) => item.id === routeId);
    setSelectedSupervisors(new Set(route ? routeSupervisorIds(route) : []));
    setSupervisorSchoolId(route?.schoolId ?? "");
    setEmployeeResults([]);
    setEmployeeCursor(undefined);
    if (routeId) void runEmployeeSearch(true, routeId, route?.schoolId ?? "");
  }

  async function runStudentSearch() {
    if (!studentSchoolId) return toast.error("اختر المدرسة أولًا");
    setSearchingStudents(true);
    try {
      setStudentResults(await searchTransportAdminStudents({
        orgId,
        schoolId: studentSchoolId,
        classId: studentClassId || undefined,
        query: studentQuery,
      }));
    } catch (searchError) {
      toast.error(transportAdminErrorMessage(searchError));
    } finally {
      setSearchingStudents(false);
    }
  }

  async function runEmployeeSearch(
    reset = true,
    routeId = supervisorRouteId,
    schoolId = supervisorSchoolId,
  ) {
    if (!routeId) return toast.error("اختر خط النقل أولًا");
    setSearchingEmployees(true);
    try {
      const result = await searchTransportAdminEmployees({
        orgId,
        routeId,
        schoolId: schoolId || undefined,
        query: supervisorQuery,
        position: supervisorPosition,
        assignmentStatus: supervisorAssignmentStatus,
        cursor: reset ? undefined : employeeCursor,
      });
      setEmployeeResults((current) => reset ? result.employees : [
        ...current,
        ...result.employees.filter((employee) => !current.some((item) => item.personId === employee.personId)),
      ]);
      setEmployeeCursor(result.nextCursor);
    } catch (searchError) {
      toast.error(transportAdminErrorMessage(searchError));
    } finally {
      setSearchingEmployees(false);
    }
  }

  function toggleStudent(student: TransportStudentSearchRow) {
    if (student.transportEnrollment) return;
    setSelectedStudents((current) => {
      const next = { ...current };
      if (next[student.studentId]) delete next[student.studentId];
      else next[student.studentId] = student;
      return next;
    });
  }

  function selectVisibleStudents() {
    setSelectedStudents((current) => {
      const next = { ...current };
      studentResults.filter((student) => !student.transportEnrollment).forEach((student) => {
        next[student.studentId] = student;
      });
      return next;
    });
  }

  function clearVisibleStudents() {
    setSelectedStudents((current) => {
      const next = { ...current };
      studentResults.forEach((student) => delete next[student.studentId]);
      return next;
    });
  }

  const enrollmentStops = (workspace?.stops ?? []).filter(
    (stop) => stop.routeId === enrollmentRouteId && stop.isActive !== false && !stop.isArchived,
  );
  const transferStops = (workspace?.stops ?? []).filter(
    (stop) => stop.routeId === transferRouteId && stop.isActive !== false && !stop.isArchived,
  );
  const studentClassOptions = useMemo(() => {
    const classes = new Map<string, string>();
    studentResults.forEach((student) => {
      if (student.classId) classes.set(student.classId, student.classTitle || student.classId);
    });
    return Array.from(classes, ([id, title]) => ({ id, title }))
      .sort((left, right) => left.title.localeCompare(right.title, "ar"));
  }, [studentResults]);
  const selectedStudentCount = Object.keys(selectedStudents).length;

  async function saveBulkEnrollments() {
    if (!enrollmentRouteId || !selectedStudentCount) return;
    setBulkEnrolling(true);
    setBulkResult(null);
    try {
      const result = await bulkEnrollTransportStudents({
        orgId,
        payload: {
          studentIds: Object.keys(selectedStudents),
          routeId: enrollmentRouteId,
          pickupStopId,
          dropoffStopId,
          startsAt: dateMs(startsAt),
          endsAt: dateMs(endsAt, true),
          notes: enrollmentNotes,
        },
      });
      const succeeded = result.succeeded.map((item) => item.studentId);
      setBulkResult({ succeeded, skipped: result.skipped });
      setSelectedStudents((current) => {
        const next = { ...current };
        succeeded.forEach((studentId) => delete next[studentId]);
        return next;
      });
      if (succeeded.length) toast.success(`تمت إضافة ${succeeded.length} طالب/ة إلى النقل`);
      if (result.skipped.length) toast.error(`تم تخطي ${result.skipped.length} طالب/ة. راجع التفاصيل.`);
      await load();
      await runStudentSearch();
    } catch (saveError) {
      toast.error(transportAdminErrorMessage(saveError));
    } finally {
      setBulkEnrolling(false);
    }
  }

  if (checkingAuth || loading) {
    return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>;
  }

  if (error || !workspace) {
    return (
      <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-5 text-destructive">
        <p className="font-bold">تعذر تحميل إدارة النقل المدرسي</p>
        <p className="mt-2 text-sm">{error}</p>
        <Button variant="outline" className="mt-4" onClick={() => void load()}>إعادة المحاولة</Button>
      </div>
    );
  }

  const tabs: Array<{ key: TabKey; label: string }> = [
    { key: "DASHBOARD", label: "لوحة المتابعة" },
    { key: "ROUTES", label: "الخطوط" },
    { key: "VEHICLES", label: "المركبات" },
    { key: "SUPERVISORS", label: "المشرفون" },
    { key: "ENROLLMENTS", label: "اشتراكات الطلاب" },
    { key: "STOPS", label: "المحطات" },
  ];

  return (
    <div dir="rtl" className="space-y-6">
      <PageHero
        badge="إدارة النقل المدرسي"
        badgeIcon={<Bus className="h-4 w-4" />}
        title="المركبات والخطوط والمشرفون والطلاب"
        description="إدارة تشغيل النقل مع تنظيم الخطوط حسب مشرف الباص والمحافظة على سجلات الحضور التاريخية."
        actions={<Button variant="outline" onClick={() => void load()}><RefreshCw className="h-4 w-4" />تحديث</Button>}
      />

      <div className="flex gap-2 overflow-x-auto pb-1">
        {tabs.map((item) => (
          <Button key={item.key} variant={tab === item.key ? "default" : "outline"} onClick={() => setTab(item.key)} className="shrink-0">
            {item.label}
          </Button>
        ))}
      </div>

      {tab === "DASHBOARD" ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <InfoCard label="المركبات" value={workspace.vehicles.filter((item) => item.status !== "ARCHIVED").length} />
            <InfoCard label="الخطوط النشطة" value={workspace.routes.filter((item) => item.status === "ACTIVE").length} />
            <InfoCard label="طلاب النقل" value={activeEnrollments.length} />
            <InfoCard label="المشرفون" value={new Set(workspace.routes.flatMap(routeSupervisorIds)).size} />
            <InfoCard label="التنبيهات" value={warnings.length} />
          </div>

          <FormSection title="تنبيهات التشغيل" description="حالات تحتاج مراجعة إدارية قبل التشغيل اليومي." contentClassName="space-y-2">
            {warnings.length ? warnings.map((warning, index) => (
              <div key={`${index}-${warning}`} className="flex items-start gap-2 rounded-xl border border-amber-400/40 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{warning}
              </div>
            )) : <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-800 dark:text-emerald-300">لا توجد تنبيهات تشغيلية حالية.</div>}
          </FormSection>

          <FormSection title="الخطوط حسب مشرف الباص" description="قد يظهر الخط تحت أكثر من مشرف عند وجود إشراف مشترك." contentClassName="space-y-4">
            {supervisorGroups.map(([personId, routes]) => (
              <div key={personId} className="rounded-2xl border bg-card p-4">
                <div className="flex items-center gap-3">
                  <UserRoundCheck className="h-5 w-5 text-primary" />
                  <div>
                    <h3 className="font-bold">{personId === "UNASSIGNED" ? "خطوط بلا مشرف" : `باص المشرف ${staffById.get(personId)?.displayName ?? personId}`}</h3>
                    {personId !== "UNASSIGNED" ? <p className="text-xs text-muted-foreground">{routes[0]?.schoolId ?? "ORG"}-{personId}</p> : null}
                  </div>
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  {routes.map((route) => (
                    <div key={`${personId}-${route.id}`} className="rounded-xl bg-muted p-3 text-sm">
                      <div className="font-semibold">{route.title}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{activeEnrollments.filter((item) => item.routeId === route.id).length} طالب · {vehicleById.get(route.vehicleId ?? "")?.title ?? "بلا مركبة"}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </FormSection>
        </>
      ) : null}

      {tab === "VEHICLES" ? (
        <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <FormSection title={vehicleDraft.id ? "تعديل المركبة" : "إضافة مركبة"} description="الأرشفة متاحة فقط بعد إزالة المركبة من الخطوط غير المؤرشفة." contentClassName="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label>اسم المركبة *</Label><Input value={vehicleDraft.title} onChange={(e) => setVehicleDraft({ ...vehicleDraft, title: e.target.value })} /></div>
              <div><Label>الرمز</Label><Input value={vehicleDraft.code} onChange={(e) => setVehicleDraft({ ...vehicleDraft, code: e.target.value })} /></div>
              <div><Label>رقم اللوحة</Label><Input value={vehicleDraft.plateNumber} onChange={(e) => setVehicleDraft({ ...vehicleDraft, plateNumber: e.target.value })} /></div>
              <div><Label>الطراز</Label><Input value={vehicleDraft.model} onChange={(e) => setVehicleDraft({ ...vehicleDraft, model: e.target.value })} /></div>
              <div><Label>السعة</Label><Input type="number" min="0" value={vehicleDraft.capacity} onChange={(e) => setVehicleDraft({ ...vehicleDraft, capacity: e.target.value })} /></div>
              <div><Label>الحالة</Label><select className={inputClass} value={vehicleDraft.status} onChange={(e) => setVehicleDraft({ ...vehicleDraft, status: e.target.value })}>{["ACTIVE", "MAINTENANCE", "INACTIVE", "ARCHIVED"].map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></div>
            </div>
            <div><Label>ملاحظات</Label><textarea className={textareaClass} value={vehicleDraft.notes} onChange={(e) => setVehicleDraft({ ...vehicleDraft, notes: e.target.value })} /></div>
            <div className="flex gap-2">
              <Button disabled={busy || !vehicleDraft.title.trim()} onClick={async () => {
                if (vehicleDraft.status === "ARCHIVED" && !window.confirm("أرشفة المركبة؟ لن يمكن استخدامها في خطوط جديدة.")) return;
                const ok = await mutate("UPSERT_VEHICLE", { ...vehicleDraft, capacity: vehicleDraft.capacity ? Number(vehicleDraft.capacity) : undefined }, "تم حفظ المركبة");
                if (ok) setVehicleDraft(newVehicleDraft());
              }}><Save className="h-4 w-4" />حفظ</Button>
              {vehicleDraft.id ? <Button variant="outline" onClick={() => setVehicleDraft(newVehicleDraft())}>إلغاء</Button> : null}
            </div>
          </FormSection>
          <FormSection title="المركبات" description="الحالة والسعة والخطوط المرتبطة." contentClassName="space-y-3">
            {workspace.vehicles.map((vehicle) => (
              <div key={vehicle.id} className="flex items-center justify-between gap-3 rounded-xl border p-3">
                <div><div className="font-bold">{vehicle.title}</div><div className="text-xs text-muted-foreground">{vehicle.plateNumber ?? "بلا لوحة"} · {statusLabel(vehicle.status)} · السعة {vehicle.capacity ?? "—"} · {workspace.routes.filter((route) => route.vehicleId === vehicle.id && route.status !== "ARCHIVED").length} خط</div></div>
                <Button size="sm" variant="outline" onClick={() => editVehicle(vehicle)}><Edit3 className="h-4 w-4" />تعديل</Button>
              </div>
            ))}
          </FormSection>
        </div>
      ) : null}

      {tab === "ROUTES" ? (
        <div className="space-y-6">
          <FormSection title={routeDraft.id ? "تعديل خط النقل" : "إضافة خط نقل"} description="هوية الخط ثابتة؛ تعديل المشرف أو عنوان العرض لا يغيّر معرّف الخط." contentClassName="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div><Label>المدرسة *</Label><select className={inputClass} value={routeDraft.schoolId} onChange={(e) => setRouteDraft({ ...routeDraft, schoolId: e.target.value, academicYearId: "" })}><option value="">اختر</option>{workspace.schools.map((school) => <option key={school.id} value={school.id}>{school.title}</option>)}</select></div>
              <div><Label>العام الدراسي *</Label><select className={inputClass} value={routeDraft.academicYearId} onChange={(e) => setRouteDraft({ ...routeDraft, academicYearId: e.target.value })}><option value="">اختر</option>{workspace.academicYears.filter((year) => !year.schoolId || year.schoolId === routeDraft.schoolId).map((year) => <option key={`${year.schoolId ?? "org"}-${year.id}`} value={year.id}>{year.title}</option>)}</select></div>
              <div><Label>المركبة</Label><select className={inputClass} value={routeDraft.vehicleId} onChange={(e) => setRouteDraft({ ...routeDraft, vehicleId: e.target.value })}><option value="">بلا مركبة</option>{workspace.vehicles.filter((vehicle) => vehicle.status !== "ARCHIVED").map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.title}</option>)}</select></div>
              <div><Label>عنوان الخط *</Label><Input value={routeDraft.title} onChange={(e) => setRouteDraft({ ...routeDraft, title: e.target.value })} placeholder="باص المشرف أحمد محمد" /></div>
              <div><Label>الرمز</Label><Input value={routeDraft.code} onChange={(e) => setRouteDraft({ ...routeDraft, code: e.target.value })} /></div>
              <div><Label>العنوان المختصر</Label><Input value={routeDraft.shortTitle} onChange={(e) => setRouteDraft({ ...routeDraft, shortTitle: e.target.value })} /></div>
              <div><Label>الحالة</Label><select className={inputClass} value={routeDraft.status} onChange={(e) => setRouteDraft({ ...routeDraft, status: e.target.value })}>{["ACTIVE", "INACTIVE", "ARCHIVED"].map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></div>
              <div><Label>الترتيب</Label><Input type="number" value={routeDraft.order} onChange={(e) => setRouteDraft({ ...routeDraft, order: e.target.value })} /></div>
              <div><Label>المنطقة (اختياري)</Label><Input value={routeDraft.areaLabel} onChange={(e) => setRouteDraft({ ...routeDraft, areaLabel: e.target.value })} /></div>
              <div><Label>نقطة البداية</Label><Input value={routeDraft.startsFromLabel} onChange={(e) => setRouteDraft({ ...routeDraft, startsFromLabel: e.target.value })} /></div>
              <div><Label>نقطة النهاية</Label><Input value={routeDraft.endsAtLabel} onChange={(e) => setRouteDraft({ ...routeDraft, endsAtLabel: e.target.value })} /></div>
            </div>
            <div><Label>الوصف</Label><textarea className={textareaClass} value={routeDraft.description} onChange={(e) => setRouteDraft({ ...routeDraft, description: e.target.value })} /></div>
            <div className="flex gap-2"><Button disabled={busy || !routeDraft.title.trim() || !routeDraft.schoolId || !routeDraft.academicYearId} onClick={async () => {
              if (routeDraft.status === "ARCHIVED" && !window.confirm("أرشفة الخط؟ يجب ألا يحتوي اشتراكات نشطة.")) return;
              const ok = await mutate("UPSERT_ROUTE", { ...routeDraft, order: routeDraft.order ? Number(routeDraft.order) : undefined }, "تم حفظ خط النقل");
              if (ok) setRouteDraft(newRouteDraft());
            }}><Save className="h-4 w-4" />حفظ الخط</Button>{routeDraft.id ? <Button variant="outline" onClick={() => setRouteDraft(newRouteDraft())}>إلغاء</Button> : null}</div>
          </FormSection>

          <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4 sm:flex-row">
            <Input placeholder="بحث باسم الخط أو المعرّف" value={search} onChange={(e) => setSearch(e.target.value)} />
            <select className={inputClass} value={schoolFilter} onChange={(e) => setSchoolFilter(e.target.value)}><option value="">كل المدارس</option>{workspace.schools.map((school) => <option key={school.id} value={school.id}>{school.title}</option>)}</select>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {filteredRoutes.map((route) => (
              <div key={route.id} className="rounded-2xl border bg-card p-4">
                <div className="flex justify-between gap-3"><div><h3 className="font-bold">{route.title}</h3><p className="text-xs text-muted-foreground">{route.id} · {statusLabel(route.status)}</p></div><Button size="sm" variant="outline" onClick={() => editRoute(route)}><Edit3 className="h-4 w-4" />تعديل</Button></div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-muted px-2.5 py-1">{activeEnrollments.filter((item) => item.routeId === route.id).length} طالب</span><span className="rounded-full bg-muted px-2.5 py-1">{vehicleById.get(route.vehicleId ?? "")?.title ?? "بلا مركبة"}</span>{routeSupervisorIds(route).map((personId) => <span key={personId} className="rounded-full bg-primary/10 px-2.5 py-1 text-primary">{staffById.get(personId)?.displayName ?? personId}</span>)}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {tab === "SUPERVISORS" ? (
        <FormSection title="إسناد مشرفي الباص" description="يمكن اختيار أكثر من مشرف للخط، ويمكن للمعلم أن يكون مشرفًا دون تغيير دوره الأساسي." contentClassName="space-y-4">
          <div><Label>خط النقل</Label><select className={inputClass} value={supervisorRouteId} onChange={(e) => chooseSupervisorRoute(e.target.value)}><option value="">اختر الخط</option>{workspace.routes.filter((route) => route.status !== "ARCHIVED").map((route) => <option key={route.id} value={route.id}>{route.title}</option>)}</select></div>
          {supervisorRouteId ? <>
            <div className="grid gap-3 rounded-2xl border bg-muted/20 p-3 md:grid-cols-2 xl:grid-cols-5">
              <Input placeholder="بحث باسم الموظف" value={supervisorQuery} onChange={(e) => setSupervisorQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void runEmployeeSearch(); }} />
              <select className={inputClass} value={supervisorSchoolId} onChange={(e) => setSupervisorSchoolId(e.target.value)}><option value="">كل المدارس ضمن الصلاحية</option>{workspace.schools.map((school) => <option key={school.id} value={school.id}>{school.title}</option>)}</select>
              <Input placeholder="المسمى أو الوظيفة" value={supervisorPosition} onChange={(e) => setSupervisorPosition(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void runEmployeeSearch(); }} />
              <select className={inputClass} value={supervisorAssignmentStatus} onChange={(e) => setSupervisorAssignmentStatus(e.target.value as "ALL" | "ASSIGNED" | "UNASSIGNED")}><option value="ALL">كل الموظفين</option><option value="ASSIGNED">لديهم إسناد نقل</option><option value="UNASSIGNED">دون إسناد نقل</option></select>
              <Button variant="outline" disabled={searchingEmployees} onClick={() => void runEmployeeSearch()}>{searchingEmployees ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}بحث</Button>
            </div>
            <div className="flex items-center justify-between text-sm text-muted-foreground"><span>المحددون لهذا الخط: {selectedSupervisors.size}</span><span>نتائج الموظفين: {employeeResults.length}</span></div>
            <div className="grid max-h-[420px] gap-2 overflow-y-auto md:grid-cols-2">
              {employeeResults.map((person) => {
                const checked = selectedSupervisors.has(person.personId);
                const schoolNames = person.schoolIds.length ? person.schoolIds.map((schoolId) => workspace.schools.find((school) => school.id === schoolId)?.title ?? schoolId).join("، ") : "كل المدارس";
                const assignedRoutes = person.assignedRouteIds.map((routeId) => workspace.routes.find((route) => route.id === routeId)?.title ?? routeId).join("، ");
                return <label key={person.personId} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${checked ? "border-primary bg-primary/5" : ""}`}><input className="mt-1" type="checkbox" checked={checked} onChange={() => setSelectedSupervisors((current) => { const next = new Set(current); checked ? next.delete(person.personId) : next.add(person.personId); return next; })} /><span className="min-w-0"><span className="block font-semibold">{person.displayName}</span><span className="block text-xs text-muted-foreground">{schoolNames} · {person.positionTitle || person.roleKey || "موظف"}</span><span className={`mt-1 block text-xs ${person.isAssignedToRoute ? "text-primary" : "text-muted-foreground"}`}>{person.assignedRouteIds.length ? `إسناد النقل الحالي: ${assignedRoutes}` : "لا يوجد إسناد نقل حالي"}</span></span></label>;
              })}
              {!searchingEmployees && !employeeResults.length ? <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground md:col-span-2">ابحث لعرض الموظفين المؤهلين ضمن نطاق المدرسة.</div> : null}
            </div>
            {employeeCursor ? <Button variant="outline" disabled={searchingEmployees} onClick={() => void runEmployeeSearch(false)}>عرض المزيد من الموظفين</Button> : null}
          </> : null}
          <Button disabled={busy || !supervisorRouteId} onClick={() => void mutate("SET_ROUTE_SUPERVISORS", { routeId: supervisorRouteId, personIds: Array.from(selectedSupervisors) }, "تم تحديث مشرفي الخط")}><ShieldCheck className="h-4 w-4" />حفظ الإسناد</Button>
        </FormSection>
      ) : null}

      {tab === "STOPS" ? (
        <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <FormSection title={stopDraft.id ? "تعديل المحطة" : "إضافة محطة"} description="المناطق والمحطات اختيارية ولا تغيّر هوية الخط." contentClassName="space-y-3">
            <div><Label>الخط *</Label><select className={inputClass} value={stopDraft.routeId} onChange={(e) => setStopDraft({ ...stopDraft, routeId: e.target.value })}><option value="">اختر</option>{workspace.routes.filter((route) => route.status !== "ARCHIVED").map((route) => <option key={route.id} value={route.id}>{route.title}</option>)}</select></div>
            <div className="grid gap-3 sm:grid-cols-2"><div><Label>اسم المحطة *</Label><Input value={stopDraft.title} onChange={(e) => setStopDraft({ ...stopDraft, title: e.target.value })} /></div><div><Label>النوع</Label><select className={inputClass} value={stopDraft.kind} onChange={(e) => setStopDraft({ ...stopDraft, kind: e.target.value })}><option value="BOTH">صعود ونزول</option><option value="PICKUP">صعود</option><option value="DROPOFF">نزول</option></select></div><div><Label>الترتيب</Label><Input type="number" value={stopDraft.order} onChange={(e) => setStopDraft({ ...stopDraft, order: e.target.value })} /></div><div><Label>المنطقة</Label><Input value={stopDraft.areaLabel} onChange={(e) => setStopDraft({ ...stopDraft, areaLabel: e.target.value })} /></div><div><Label>وقت الصباح</Label><Input type="time" value={stopDraft.estimatedMorningTime} onChange={(e) => setStopDraft({ ...stopDraft, estimatedMorningTime: e.target.value })} /></div><div><Label>وقت العصر</Label><Input type="time" value={stopDraft.estimatedAfternoonTime} onChange={(e) => setStopDraft({ ...stopDraft, estimatedAfternoonTime: e.target.value })} /></div></div>
            <div><Label>العنوان</Label><Input value={stopDraft.addressText} onChange={(e) => setStopDraft({ ...stopDraft, addressText: e.target.value })} /></div>
            <div><Label>الوصف</Label><textarea className={textareaClass} value={stopDraft.description} onChange={(e) => setStopDraft({ ...stopDraft, description: e.target.value })} /></div>
            <div className="flex gap-2"><Button disabled={busy || !stopDraft.routeId || !stopDraft.title.trim()} onClick={async () => { const ok = await mutate("UPSERT_STOP", { ...stopDraft, order: stopDraft.order ? Number(stopDraft.order) : 0 }, "تم حفظ المحطة"); if (ok) setStopDraft(newStopDraft()); }}><Save className="h-4 w-4" />حفظ</Button>{stopDraft.id ? <Button variant="outline" onClick={() => setStopDraft(newStopDraft())}>إلغاء</Button> : null}</div>
          </FormSection>
          <FormSection title="المحطات" description="مرتبة داخل كل خط." contentClassName="space-y-4">
            {workspace.routes.filter((route) => workspace.stops.some((stop) => stop.routeId === route.id && !stop.isArchived)).map((route) => <div key={route.id}><h3 className="mb-2 font-bold">{route.title}</h3><div className="space-y-2">{workspace.stops.filter((stop) => stop.routeId === route.id && !stop.isArchived).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((stop) => <div key={stop.id} className="flex items-center justify-between rounded-xl border p-3"><div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" /><div><div className="font-semibold">{stop.title}</div><div className="text-xs text-muted-foreground">الترتيب {stop.order ?? 0} · {stop.kind}</div></div></div><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => editStop(stop)}>تعديل</Button><Button size="sm" variant="destructive" onClick={() => { if (window.confirm("أرشفة المحطة؟")) void mutate("ARCHIVE_STOP", { stopId: stop.id, routeId: stop.routeId }, "تمت أرشفة المحطة"); }}>أرشفة</Button></div></div>)}</div></div>)}
          </FormSection>
        </div>
      ) : null}

      {tab === "ENROLLMENTS" ? (
        <div className="space-y-6">
          <FormSection title="اختيار الطلاب وإضافتهم للنقل" description="ابحث عن الطلاب النشطين، حدّد مجموعة، ثم طبّق خطًا ومحطات وتواريخ مشتركة عليهم." contentClassName="space-y-4">
            <div className="grid gap-3 rounded-2xl border bg-muted/20 p-3 md:grid-cols-2 xl:grid-cols-4">
              <select className={inputClass} value={studentSchoolId} onChange={(e) => { setStudentSchoolId(e.target.value); setStudentClassId(""); setStudentResults([]); }}><option value="">اختر المدرسة</option>{workspace.schools.map((school) => <option key={school.id} value={school.id}>{school.title}</option>)}</select>
              <select className={inputClass} value={studentClassId} onChange={(e) => setStudentClassId(e.target.value)} disabled={!studentSchoolId}><option value="">كل الفصول</option>{studentClassOptions.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select>
              <Input placeholder="بحث باسم الطالب أو المعرّف" value={studentQuery} onChange={(e) => setStudentQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void runStudentSearch(); }} />
              <Button onClick={() => void runStudentSearch()} disabled={searchingStudents}>{searchingStudents ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}بحث</Button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm"><span>الطلاب المحددون: <strong>{selectedStudentCount}</strong></span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={!studentResults.length} onClick={selectVisibleStudents}>تحديد النتائج الظاهرة</Button><Button size="sm" variant="outline" disabled={!studentResults.length} onClick={clearVisibleStudents}>مسح النتائج الظاهرة</Button></div></div>
            {studentResults.length ? <div className="grid max-h-[420px] gap-2 overflow-y-auto md:grid-cols-2">{studentResults.map((student) => {
              const existing = student.transportEnrollment;
              const checked = !!selectedStudents[student.studentId];
              const otherRoute = existing && existing.routeId !== enrollmentRouteId;
              return <label key={student.studentId} className={`flex items-start gap-3 rounded-xl border p-3 ${checked ? "border-primary bg-primary/5" : ""} ${existing ? "cursor-not-allowed opacity-70" : "cursor-pointer"}`}><input className="mt-1" type="checkbox" checked={checked} disabled={!!existing} onChange={() => toggleStudent(student)} /><span className="min-w-0"><span className="block font-bold">{student.displayName}</span><span className="block text-xs text-muted-foreground">{student.classTitle || student.classId || "بدون فصل"} · {student.studentId}</span><span className={`mt-1 block text-xs ${otherRoute ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground"}`}>{existing ? (otherRoute ? `مشترك حاليًا في خط آخر: ${existing.routeTitle ?? existing.routeId}` : `لديه اشتراك نشط في هذا الخط: ${existing.routeTitle ?? existing.routeId}`) : "متاح للإضافة"}</span></span></label>;
            })}</div> : null}
            {studentSchoolId ? <div className="space-y-3 rounded-2xl border bg-muted/30 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">إعداد الاشتراك المشترك</h3><span className="text-sm text-muted-foreground">{selectedStudentCount} طالب/ة محدد</span></div><div className="grid gap-3 md:grid-cols-3"><div><Label>خط النقل *</Label><select className={inputClass} value={enrollmentRouteId} onChange={(e) => { setEnrollmentRouteId(e.target.value); setPickupStopId(""); setDropoffStopId(""); }}><option value="">اختر</option>{workspace.routes.filter((route) => route.status === "ACTIVE" && route.schoolId === studentSchoolId).map((route) => <option key={route.id} value={route.id}>{route.title}</option>)}</select></div><div><Label>محطة الصعود</Label><select className={inputClass} value={pickupStopId} onChange={(e) => setPickupStopId(e.target.value)}><option value="">بدون</option>{enrollmentStops.filter((stop) => stop.kind !== "DROPOFF").map((stop) => <option key={stop.id} value={stop.id}>{stop.title}</option>)}</select></div><div><Label>محطة النزول</Label><select className={inputClass} value={dropoffStopId} onChange={(e) => setDropoffStopId(e.target.value)}><option value="">بدون</option>{enrollmentStops.filter((stop) => stop.kind !== "PICKUP").map((stop) => <option key={stop.id} value={stop.id}>{stop.title}</option>)}</select></div><div><Label>البداية</Label><Input type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} /></div><div><Label>النهاية الاختيارية</Label><Input type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} /></div></div><textarea className={textareaClass} placeholder="ملاحظة اختيارية للمجموعة" value={enrollmentNotes} onChange={(e) => setEnrollmentNotes(e.target.value)} /><Button disabled={bulkEnrolling || !enrollmentRouteId || !selectedStudentCount} onClick={() => void saveBulkEnrollments()}>{bulkEnrolling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}إضافة {selectedStudentCount} طالب/ة إلى الخط</Button></div> : null}
            {bulkResult ? <div className="space-y-2 rounded-xl border p-3 text-sm"><div className="text-emerald-700 dark:text-emerald-300">تمت إضافة {bulkResult.succeeded.length} طالب/ة بنجاح.</div>{bulkResult.skipped.length ? <div className="space-y-1 text-amber-800 dark:text-amber-200"><div>تم تخطي {bulkResult.skipped.length} طالب/ة:</div>{bulkResult.skipped.map((item) => <div key={item.studentId}>• {selectedStudents[item.studentId]?.displayName ?? item.studentId}: {item.message}</div>)}</div> : null}</div> : null}
          </FormSection>

          {transferEnrollment ? <FormSection title={`نقل ${transferEnrollment.studentDisplayName ?? transferEnrollment.studentId} إلى خط آخر`} description="يُنهي الاشتراك السابق وينشئ اشتراكًا جديدًا دون تغيير السجلات التاريخية." contentClassName="space-y-3"><div className="grid gap-3 md:grid-cols-3"><div><Label>الخط الجديد</Label><select className={inputClass} value={transferRouteId} onChange={(e) => { setTransferRouteId(e.target.value); setPickupStopId(""); setDropoffStopId(""); }}><option value="">اختر</option>{workspace.routes.filter((route) => route.status === "ACTIVE" && route.id !== transferEnrollment.routeId && route.schoolId === transferEnrollment.schoolId && (!route.academicYearId || route.academicYearId === transferEnrollment.academicYearId)).map((route) => <option key={route.id} value={route.id}>{route.title}</option>)}</select></div><div><Label>محطة الصعود</Label><select className={inputClass} value={pickupStopId} onChange={(e) => setPickupStopId(e.target.value)}><option value="">بدون</option>{transferStops.filter((stop) => stop.kind !== "DROPOFF").map((stop) => <option key={stop.id} value={stop.id}>{stop.title}</option>)}</select></div><div><Label>محطة النزول</Label><select className={inputClass} value={dropoffStopId} onChange={(e) => setDropoffStopId(e.target.value)}><option value="">بدون</option>{transferStops.filter((stop) => stop.kind !== "PICKUP").map((stop) => <option key={stop.id} value={stop.id}>{stop.title}</option>)}</select></div><div><Label>تاريخ النقل</Label><Input type="date" value={transferDate} onChange={(e) => setTransferDate(e.target.value)} /></div></div><div className="flex gap-2"><Button disabled={busy || !transferRouteId} onClick={async () => { if (!window.confirm("نقل الطالب وإنهاء اشتراكه السابق؟")) return; const ok = await mutate("TRANSFER_ENROLLMENT", { enrollmentId: transferEnrollment.id, targetRouteId: transferRouteId, transferAt: dateMs(transferDate), pickupStopId, dropoffStopId, operationId: crypto.randomUUID() }, "تم نقل الطالب إلى الخط الجديد"); if (ok) setTransferEnrollment(null); }}><Bus className="h-4 w-4" />تأكيد النقل</Button><Button variant="outline" onClick={() => setTransferEnrollment(null)}>إلغاء</Button></div></FormSection> : null}

          <FormSection title="اشتراكات النقل" description="الإيقاف المؤقت والاستئناف والإنهاء والنقل الآمن بين الخطوط." contentClassName="space-y-2">
            {[...workspace.enrollments].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)).map((enrollment) => <div key={enrollment.id} className="flex flex-col gap-3 rounded-xl border p-3 lg:flex-row lg:items-center lg:justify-between"><div><div className="font-bold">{enrollment.studentDisplayName ?? enrollment.studentId}</div><div className="text-xs text-muted-foreground">{enrollment.routeTitle ?? enrollment.routeId} · {statusLabel(enrollment.status)} · {dateInput(enrollment.startsAt)}{enrollment.endsAt ? ` — ${dateInput(enrollment.endsAt)}` : ""}</div></div><div className="flex flex-wrap gap-2">{enrollment.status === "ACTIVE" ? <Button size="sm" variant="outline" onClick={() => void mutate("CHANGE_ENROLLMENT_STATUS", { enrollmentId: enrollment.id, status: "PAUSED" }, "تم إيقاف الاشتراك مؤقتًا")}>إيقاف مؤقت</Button> : null}{enrollment.status === "PAUSED" ? <Button size="sm" variant="outline" onClick={() => void mutate("CHANGE_ENROLLMENT_STATUS", { enrollmentId: enrollment.id, status: "ACTIVE" }, "تم استئناف الاشتراك")}>استئناف</Button> : null}{["ACTIVE", "PAUSED"].includes(enrollment.status) ? <><Button size="sm" variant="outline" onClick={() => { setTransferEnrollment(enrollment); setTransferRouteId(""); setPickupStopId(""); setDropoffStopId(""); }}>نقل</Button><Button size="sm" variant="destructive" onClick={() => { if (window.confirm("إنهاء اشتراك النقل؟ سيبقى السجل محفوظًا للتاريخ.")) void mutate("CHANGE_ENROLLMENT_STATUS", { enrollmentId: enrollment.id, status: "ENDED", endsAt: Date.now() }, "تم إنهاء الاشتراك"); }}>إنهاء</Button></> : null}</div></div>)}
          </FormSection>
        </div>
      ) : null}
    </div>
  );
}
