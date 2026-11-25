"use client";

import { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { ref, uploadBytesResumable } from "firebase/storage";
import type { SchoolAnnouncement } from "@takween/contracts";
import { Button } from "@/components/ui/button";
import { functions, storage } from "@/lib/firebase";

const accepted = ".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp";
const contentTypes: Record<string, string> = {
  pdf: "application/pdf", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
};
const callable = httpsCallable<Record<string, unknown>, Record<string, unknown>>(functions, "staffAnnouncementFiles");

export function AnnouncementFiles({ orgId, announcement, onChanged }: { orgId: string; announcement: SchoolAnnouncement; onChanged: () => Promise<void> }) {
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const files = announcement.storedAttachments ?? [];

  useEffect(() => {
    let active = true;
    setImageUrl("");
    if (announcement.mainImageFile) {
      void callable({ action: "preview", orgId, announcementId: announcement.id, fileId: announcement.mainImageFile.id })
        .then((result) => { if (active && typeof result.data.url === "string") setImageUrl(result.data.url); })
        .catch(() => { if (active) setError("تعذر تحميل معاينة الصورة."); });
    }
    return () => { active = false; };
  }, [orgId, announcement.id, announcement.mainImageFile?.id]);

  async function upload(file: File, kind: "image" | "attachment") {
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    const contentType = contentTypes[extension];
    if (!contentType || (kind === "image" && !contentType.startsWith("image/")) || file.size <= 0 || file.size > 10 * 1024 * 1024) {
      setError("نوع الملف غير مدعوم أو يتجاوز حجمه 10 ميجابايت."); return;
    }
    setBusy(true); setProgress(0); setError("");
    try {
      const started = await callable({ action: "begin", orgId, announcementId: announcement.id, kind, name: file.name, sizeBytes: file.size, contentType });
      if (typeof started.data.storagePath !== "string" || typeof started.data.grantId !== "string") throw new Error("تعذر بدء الرفع.");
      const task = uploadBytesResumable(ref(storage, started.data.storagePath), file, { contentType });
      await new Promise<void>((resolve, reject) => task.on("state_changed", (snapshot) => setProgress(Math.round(snapshot.bytesTransferred / snapshot.totalBytes * 100)), reject, resolve));
      await callable({ action: "finish", orgId, announcementId: announcement.id, grantId: started.data.grantId });
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر رفع الملف.");
    } finally { setBusy(false); setProgress(null); }
  }

  async function remove(fileId: string) {
    setBusy(true); setError("");
    try { await callable({ action: "remove", orgId, announcementId: announcement.id, fileId }); await onChanged(); }
    catch (e) { setError(e instanceof Error ? e.message : "تعذر إزالة الملف."); }
    finally { setBusy(false); }
  }

  return <section className="space-y-3 rounded-xl border p-4" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file && !busy) void upload(file, "attachment"); }}>
    <h2 className="font-semibold">رفع الصورة والمرفقات</h2>
    <p className="text-xs text-muted-foreground">حتى خمسة مرفقات، 10 ميجابايت لكل ملف. يمكن سحب الملف إلى هنا.</p>
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    {progress !== null ? <p role="status" className="text-sm">جارٍ الرفع: {progress}%</p> : null}
    {imageUrl ? <img src={imageUrl} alt="معاينة صورة الإعلان" className="max-h-40 rounded-lg object-contain" /> : null}
    {announcement.mainImageFile ? <div className="flex items-center gap-2 text-sm">{announcement.mainImageFile.name} ({(announcement.mainImageFile.sizeBytes / 1024 / 1024).toFixed(2)} MB)<Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void remove(announcement.mainImageFile!.id)}>إزالة</Button></div> : null}
    <label className="block text-sm">{announcement.mainImageFile ? "استبدال الصورة" : "اختيار صورة"}<input className="mt-2 block" type="file" accept=".jpg,.jpeg,.png,.webp" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file, "image"); event.target.value = ""; }} /></label>
    {files.map((file) => <div key={file.id} className="flex items-center gap-2 text-sm"><span>{file.name} ({(file.sizeBytes / 1024 / 1024).toFixed(2)} MB)</span><Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void remove(file.id)}>إزالة</Button></div>)}
    <label className="block text-sm">اختيار مرفق<input className="mt-2 block" type="file" accept={accepted} disabled={busy || files.length + announcement.attachments.length >= 5} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file, "attachment"); event.target.value = ""; }} /></label>
  </section>;
}
