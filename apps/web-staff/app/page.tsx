"use client";

import Link from "next/link";
import {
  ArrowLeft,
  BookOpenCheck,
  ClipboardCheck,
  GraduationCap,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { FullScreenTakweenLoader } from "@/components/ui/takween-loader";

const features = [
  {
    title: "فصولي وطلابي",
    description: "وصول منظم للفصول والطلاب المرتبطين بعملك اليومي.",
    icon: GraduationCap,
  },
  {
    title: "الحضور والقياسات",
    description: "متابعة الحضور والقياسات والمتابعات التعليمية من مكان واحد.",
    icon: ClipboardCheck,
  },
  {
    title: "التقييمات والقضايا",
    description: "إدارة التقييمات والإحالات والمهام المرتبطة بدورك داخل المدرسة.",
    icon: BookOpenCheck,
  },
];

export default function WebStaffLandingPage() {
  const { checkingAuth } = useRequireAuth();

  if (checkingAuth) {
    return (
      <main className="min-h-screen bg-background px-4 py-8 text-foreground">
        <div className="mx-auto flex min-h-[70vh] max-w-5xl items-center justify-center">
          <FullScreenTakweenLoader
                label="جاري تجهيز الصفحة..."
                sublabel="لحظات قليلة"
              />
          
          <Card className="w-full max-w-md border-dashed text-center">
            <CardHeader>
              <CardTitle>مرحبًا بك في مدار</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              جاري تجهيز مساحة العمل الخاصة بك.
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen overflow-hidden bg-background text-foreground">
      <section className="relative px-4 py-8 md:py-12">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(15,118,110,0.20),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.14),transparent_35%)]" />

        <div className="mx-auto max-w-6xl">
          <div className="mb-8 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <ShieldCheck className="size-6" />
              </div>

              <div>
                <div className="text-sm text-muted-foreground">
                  مدار
                </div>
                <div className="font-semibold">شركة تكوين المعرفة للتعليم</div>
              </div>
            </div>

            <Button asChild variant="outline">
              <Link href="/staff" prefetch>
                الدخول للبوابة
                <ArrowLeft className="size-4" />
              </Link>
            </Button>
          </div>

          <div className="grid items-center gap-8 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="space-y-7">
              <div className="inline-flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-sm text-muted-foreground shadow-sm">
                <Sparkles className="size-4 text-primary" />
                مساحة عمل موحدة لمنسوبي تكوين
              </div>

              <div className="space-y-4">
                <h1 className="max-w-3xl text-4xl font-bold leading-tight md:text-6xl">
                  ابدأ يومك من بوابة واحدة واضحة ومنظمة.
                </h1>

                <p className="max-w-2xl text-base leading-8 text-muted-foreground md:text-lg">
                  بوابة تكوين للموظفين تساعد منسوبي تكوين المعرفة على متابعة
                  أعمالهم اليومية بسهولة، من الفصول والطلاب إلى الحضور
                  والقياسات والتقييمات والتواصل.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg" className="h-12 px-7">
                  <Link href="/staff" prefetch>
                    ابدأ الآن
                    <ArrowLeft className="size-5" />
                  </Link>
                </Button>

                {/* <Button asChild size="lg" variant="secondary" className="h-12 px-7">
                  <Link href="/staff/messages" prefetch>
                    فتح الرسائل
                  </Link>
                </Button> */}
              </div>
            </div>

            <Card className="border-primary/15 bg-card/80 shadow-xl backdrop-blur">
              <CardHeader>
                <CardTitle>لماذا مدار؟</CardTitle>
              </CardHeader>

              <CardContent className="space-y-4 text-sm leading-7 text-muted-foreground">
                <div className="rounded-2xl border bg-background/70 p-4">
                  تجمع أعمال الموظف اليومية في واجهة واحدة بدل التنقل بين أكثر
                  من مصدر.
                </div>

                <div className="rounded-2xl border bg-background/70 p-4">
                  تساعد على متابعة الطلاب والفصول والمهام بشكل أكثر تنظيمًا
                  ووضوحًا.
                </div>

                <div className="rounded-2xl border bg-background/70 p-4">
                  تدعم العمل التعليمي والإداري اليومي بما يرفع جودة المتابعة
                  وسرعة الإنجاز.
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {features.map((item) => {
              const Icon = item.icon;

              return (
                <Card key={item.title} className="bg-card/80 backdrop-blur">
                  <CardHeader className="space-y-3">
                    <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <Icon className="size-6" />
                    </div>
                    <CardTitle className="text-lg">{item.title}</CardTitle>
                  </CardHeader>

                  <CardContent className="text-sm leading-7 text-muted-foreground">
                    {item.description}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>
    </main>
  );
}