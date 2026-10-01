"use client";

import { useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import type { StaffPdfFile } from "@takween/contracts";

import type { StaffActorData } from "@/lib/staff-actor";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  deleteStaffPdfFile,
  downloadStaffPdfFile,
  formatStaffPdfFileSize,
  getStaffPdfFileErrorMessage,
  isStaffPdfFileOwner,
  viewStaffPdfFile,
} from "@/lib/staff-pdf-files";

function formatDate(value: number) {
  return new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium" }).format(
    new Date(value),
  );
}

function ownerDisplaySchoolIds(file: StaffPdfFile) {
  return file.ownerMembershipSchoolIds.length > 0
    ? file.ownerMembershipSchoolIds
    : file.ownerSchoolIds;
}

function ownerSchoolLabel(file: StaffPdfFile, schoolNames: Map<string, string>) {
  return ownerDisplaySchoolIds(file)
    .map((schoolId) => schoolNames.get(schoolId))
    .find(Boolean) ?? "";
}

function fileCountLabel(count: number) {
  if (count === 1) return "ملف واحد";
  if (count === 2) return "ملفان";
  return `${count} ملفات`;
}

function StaffPdfFileCards(props: {
  files: StaffPdfFile[];
  actor: StaffActorData;
  showOwner: boolean;
  busyId: string;
  deletingId: string;
  onAction: (file: StaffPdfFile, action: "view" | "download") => void;
  onDeleteRequest: (file: StaffPdfFile) => void;
}) {
  return (
    <div className="space-y-2">
      {props.files.map((file) => {
        const isDeleting = props.deletingId === file.id;
        const canDelete = isStaffPdfFileOwner({ actor: props.actor, file });

        return (
          <Card key={file.id}>
          <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <FileText className="size-5 shrink-0 text-primary" />
                <h4 className="truncate font-semibold">{file.title}</h4>
              </div>
              {file.description ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  {file.description}
                </p>
              ) : null}
              <p className="mt-2 text-xs text-muted-foreground">
                {file.originalFileName} · {formatStaffPdfFileSize(file.sizeBytes)} · رُفع {formatDate(file.createdAt)}
              </p>
              {props.showOwner ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  بواسطة: {file.ownerDisplayName}
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={isDeleting || props.busyId === `view-${file.id}`}
                onClick={() => props.onAction(file, "view")}
              >
                {props.busyId === `view-${file.id}` ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ExternalLink className="size-4" />
                )}
                عرض
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={isDeleting || props.busyId === `download-${file.id}`}
                onClick={() => props.onAction(file, "download")}
              >
                {props.busyId === `download-${file.id}` ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Download className="size-4" />
                )}
                تنزيل
              </Button>
              {canDelete ? (
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={isDeleting}
                  onClick={() => props.onDeleteRequest(file)}
                >
                  {isDeleting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Trash2 className="size-4" />
                  )}
                  حذف
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
        );
      })}
    </div>
  );
}

export function StaffPdfFileList(props: {
  files: StaffPdfFile[];
  actor: StaffActorData;
  showOwner: boolean;
  schoolNames: Map<string, string>;
  emptyLabel: string;
  onDeleted: (fileId: string) => void;
}) {
  const [busyId, setBusyId] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<StaffPdfFile | null>(null);
  const [deletingId, setDeletingId] = useState("");
  const deleteInFlight = useRef(false);
  const [openOwnerPersonIds, setOpenOwnerPersonIds] = useState<Set<string>>(
    () => new Set(),
  );
  const fileGroups = useMemo(() => {
    const groups = new Map<string, StaffPdfFile[]>();
    for (const file of props.files) {
      const group = groups.get(file.ownerPersonId) ?? [];
      group.push(file);
      groups.set(file.ownerPersonId, group);
    }

    return Array.from(groups.values())
      .map((files) =>
        [...files].sort((left, right) => right.createdAt - left.createdAt),
      )
      .sort((left, right) =>
        left[0].ownerDisplayName.localeCompare(right[0].ownerDisplayName, "ar"),
      );
  }, [props.files]);

  async function runAction(file: StaffPdfFile, action: "view" | "download") {
    setBusyId(`${action}-${file.id}`);
    try {
      if (action === "view") await viewStaffPdfFile(file);
      else await downloadStaffPdfFile(file);
    } catch (error) {
      toast.error(getStaffPdfFileErrorMessage(error));
    } finally {
      setBusyId("");
    }
  }

  async function confirmDelete() {
    const file = deleteTarget;
    if (!file || deleteInFlight.current) return;

    deleteInFlight.current = true;
    setDeletingId(file.id);
    try {
      await deleteStaffPdfFile({ actor: props.actor, file });
      props.onDeleted(file.id);
      setDeleteTarget(null);
      toast.success("تم حذف الملف.");
    } catch (error) {
      toast.error(getStaffPdfFileErrorMessage(error));
    } finally {
      deleteInFlight.current = false;
      setDeletingId("");
    }
  }

  function toggleOwner(ownerPersonId: string) {
    setOpenOwnerPersonIds((current) => {
      const next = new Set(current);
      if (next.has(ownerPersonId)) next.delete(ownerPersonId);
      else next.add(ownerPersonId);
      return next;
    });
  }

  const deleteDialog = (
    <AlertDialog
      open={deleteTarget !== null}
      onOpenChange={(open) => {
        if (!open && !deletingId) setDeleteTarget(null);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>حذف ملف PDF</AlertDialogTitle>
          <AlertDialogDescription>
            هل تريد حذف هذا الملف نهائيًا؟ لا يمكن التراجع عن هذا الإجراء.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button variant="outline" disabled={Boolean(deletingId)}>إلغاء</Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button
              variant="destructive"
              disabled={Boolean(deletingId)}
              onClick={() => void confirmDelete()}
            >
              {deletingId ? <Loader2 className="size-4 animate-spin" /> : null}
              حذف
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  if (props.files.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          {props.emptyLabel}
        </CardContent>
      </Card>
    );
  }

  if (props.showOwner) {
    return (
      <>
        <div className="space-y-2">
        {fileGroups.map((group) => {
          const owner = group[0];
          const isOpen = openOwnerPersonIds.has(owner.ownerPersonId);
          const panelId = `staff-pdf-owner-${encodeURIComponent(owner.ownerPersonId)}`;
          const schoolLabel = ownerSchoolLabel(owner, props.schoolNames);

          return (
            <section key={owner.ownerPersonId} className="overflow-hidden rounded-xl border bg-card">
              <button
                type="button"
                className="flex w-full items-center gap-3 p-4 text-right transition-colors hover:bg-muted/50"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => toggleOwner(owner.ownerPersonId)}
              >
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-semibold">{owner.ownerDisplayName}</h3>
                  <p className="mt-1 truncate text-sm text-muted-foreground">
                    {[schoolLabel, fileCountLabel(group.length)]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <ChevronDown
                  className={`size-5 shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
                  aria-hidden="true"
                />
              </button>
              {isOpen ? (
                <div id={panelId} className="border-t bg-muted/20 p-3 sm:p-4">
                  <StaffPdfFileCards
                    files={group}
                    actor={props.actor}
                    showOwner={false}
                    busyId={busyId}
                    deletingId={deletingId}
                    onAction={(file, action) => void runAction(file, action)}
                    onDeleteRequest={setDeleteTarget}
                  />
                </div>
              ) : null}
            </section>
          );
        })}
        </div>
        {deleteDialog}
      </>
    );
  }

  // Keep the existing flat "ملفاتي" presentation unchanged.
  return (
    <>
      <div className="space-y-5">
      {fileGroups.map((group) => (
        <section key={group[0].ownerPersonId} className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {ownerDisplaySchoolIds(group[0]).map((schoolId) => (
              <Badge key={schoolId} variant="outline">
                {props.schoolNames.get(schoolId) ?? "مدرسة ضمن النطاق"}
              </Badge>
            ))}
          </div>
          <StaffPdfFileCards
            files={group}
            actor={props.actor}
            showOwner={false}
            busyId={busyId}
            deletingId={deletingId}
            onAction={(file, action) => void runAction(file, action)}
            onDeleteRequest={setDeleteTarget}
          />
        </section>
      ))}
      </div>
      {deleteDialog}
    </>
  );
}
