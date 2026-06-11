"use client"

import { IconPencil, IconTrash } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type {
  SchoolStatus,
  SchoolType,
} from "@/components/schools/SchoolFormDialog"

export type School = {
  id: string
  code: string
  name: string
  type: SchoolType
  city: string
  status: SchoolStatus
}

type Props = {
  schools: School[]
  onEdit: (school: School) => void
  onDelete: (id: string) => void
}

export default function SchoolsTable({
  schools,
  onEdit,
  onDelete,
}: Props) {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-right">الكود</TableHead>
            <TableHead className="text-right">اسم المدرسة</TableHead>
            <TableHead className="text-right">النوع</TableHead>
            <TableHead className="text-right">المدينة</TableHead>
            <TableHead className="text-right">الحالة</TableHead>
            <TableHead className="text-right">الإجراءات</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {schools.length > 0 ? (
            schools.map((school) => (
              <TableRow key={school.id}>
                <TableCell>{school.code}</TableCell>
                <TableCell className="font-medium">{school.name}</TableCell>
                <TableCell>{school.type}</TableCell>
                <TableCell>{school.city}</TableCell>
                <TableCell>{school.status}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-lg"
                      onClick={() => onEdit(school)}
                    >
                      <IconPencil className="h-4 w-4" />
                      <span>تعديل</span>
                    </Button>

                    <Button
                      variant="destructive"
                      size="sm"
                      className="rounded-lg"
                      onClick={() => onDelete(school.id)}
                    >
                      <IconTrash className="h-4 w-4" />
                      <span>حذف</span>
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell
                colSpan={6}
                className="py-8 text-center text-muted-foreground"
              >
                لا توجد نتائج مطابقة
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}