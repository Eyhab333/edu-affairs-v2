import AdminShell from "@/components/layout/AdminShell"
import PageHeader from "@/components/shared/PageHeader"
import SectionCard from "@/components/shared/SectionCard"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export default function Loading() {
  return (
    <AdminShell>
      <div className="space-y-6">
        <PageHeader
          title="المدارس"
          description="إدارة المدارس داخل النظام"
        />

        <SectionCard
          title="قائمة المدارس"
          description="عرض جميع المدارس المرتبطة بالمنظمة"
          contentClassName="p-0"
        >
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">اسم المدرسة</TableHead>
                  <TableHead className="text-right">النوع</TableHead>
                  <TableHead className="text-right">الموديولات</TableHead>
                  <TableHead className="text-right">الحالة</TableHead>
                  <TableHead className="text-right">الإجراءات</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {Array.from({ length: 5 }).map((_, index) => (
                  <TableRow key={index}>
                    <TableCell>
                      <Skeleton className="h-5 w-40 rounded-lg" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-5 w-24 rounded-lg" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-5 w-52 rounded-lg" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-6 w-16 rounded-full" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-8 w-20 rounded-md" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </SectionCard>
      </div>
    </AdminShell>
  )
}