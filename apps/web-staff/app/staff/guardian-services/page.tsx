import Link from "next/link";
import {
  Bell,
  ChevronLeft,
  MessageSquare,
  ReceiptText,
  UsersRound,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

const guardianServices = [
  {
    title: "الرسوم والمدفوعات",
    description:
      "إدارة مستحقات الطلاب ودفعات أولياء الأمور والإيصالات.",
    href: "/staff/guardian-services/finance",
    icon: ReceiptText,
    available: true,
  },
  {
    title: "الطلبات والاستفسارات",
    description:
      "استقبال طلبات أولياء الأمور ومتابعة حالتها.",
    href: "",
    icon: UsersRound,
    available: false,
  },
  {
    title: "المراسلات",
    description:
      "التواصل المباشر مع أولياء الأمور ومتابعة المحادثات.",
    href: "",
    icon: MessageSquare,
    available: false,
  },
  {
    title: "الإعلانات",
    description:
      "إرسال الإعلانات والتنبيهات الموجهة لأولياء الأمور.",
    href: "",
    icon: Bell,
    available: false,
  },
];

export default function GuardianServicesPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <UsersRound className="size-6" />
        </div>

        <div>
          <h1 className="text-2xl font-bold">
            خدمات ولي الأمر
          </h1>

          <p className="text-sm text-muted-foreground">
            إدارة الخدمات والتواصل والعمليات المرتبطة بأولياء الأمور.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {guardianServices.map((service) => {
          const Icon = service.icon;

          const content = (
            <Card
              className={
                service.available
                  ? "h-full transition hover:border-primary/50 hover:bg-muted/20"
                  : "h-full opacity-60"
              }
            >
              <CardContent className="flex h-full items-center justify-between gap-4 pt-6">
                <div className="flex min-w-0 items-start gap-4">
                  <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <Icon className="size-6" />
                  </div>

                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold">
                        {service.title}
                      </h2>

                      {!service.available ? (
                        <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                          قريبًا
                        </span>
                      ) : null}
                    </div>

                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {service.description}
                    </p>
                  </div>
                </div>

                {service.available ? (
                  <ChevronLeft className="size-5 shrink-0 text-muted-foreground" />
                ) : null}
              </CardContent>
            </Card>
          );

          if (!service.available) {
            return (
              <div key={service.title}>
                {content}
              </div>
            );
          }

          return (
            <Link
              key={service.title}
              href={service.href}
              className="block"
            >
              {content}
            </Link>
          );
        })}
      </div>
    </div>
  );
}