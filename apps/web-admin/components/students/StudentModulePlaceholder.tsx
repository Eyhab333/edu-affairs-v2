"use client";

import Link from "next/link";
import { ArrowLeft, Clock3 } from "lucide-react";

import PageHero from "@/components/shared/PageHero";
import FormSection from "@/components/shared/FormSection";
import { Button } from "@/components/ui/button";

type Props = {
  orgId: string;
  studentId: string;
  badge: string;
  title: string;
  description: string;
  focus: string;
  nextStep: string;
};

export default function StudentModulePlaceholder({
  orgId,
  studentId,
  badge,
  title,
  description,
  focus,
  nextStep,
}: Props) {
  return (
    <div className="space-y-6">
      <PageHero
        badge={badge}
        badgeIcon={<Clock3 className="h-3.5 w-3.5" />}
        title={title}
        description={description}
        actions={
          <Button asChild variant="outline">
            <Link href={`/orgs/${orgId}/students/${studentId}`}>
              <ArrowLeft className="h-4 w-4" />
              العودة إلى ملف الطالب
            </Link>
          </Button>
        }
      />

      <FormSection
        title="حالة الصفحة"
        description="هذه مساحة تمهيدية جاهزة للتطوير في الخطوة التالية."
        contentClassName="space-y-4"
      >
        <div className="rounded-2xl border bg-card px-4 py-4 text-sm leading-7 text-muted-foreground">
          تم إنشاء هذه الصفحة كواجهة أساسية داخل ملف الطالب حتى تصبح بنية
          الملف واضحة ومنظمة من الآن، ثم نضيف المنطق الفعلي والبيانات لاحقًا.
        </div>
      </FormSection>

      <FormSection
        title="هدف هذه المساحة"
        description="ما الذي ستحتويه هذه الصفحة عند بدء التطوير الفعلي."
        contentClassName="space-y-4"
      >
        <div className="rounded-2xl border bg-card px-4 py-4 text-sm leading-7">
          <div className="font-medium">الهدف</div>
          <div className="mt-1 text-muted-foreground">{focus}</div>
        </div>

        <div className="rounded-2xl border bg-card px-4 py-4 text-sm leading-7">
          <div className="font-medium">الخطوة التالية المقترحة</div>
          <div className="mt-1 text-muted-foreground">{nextStep}</div>
        </div>
      </FormSection>
    </div>
  );
}