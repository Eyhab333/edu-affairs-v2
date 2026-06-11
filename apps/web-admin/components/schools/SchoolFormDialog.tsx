"use client"

import { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

export type SchoolStatus = "نشطة" | "مؤرشفة"
export type SchoolType = "بنين" | "بنات" | "روضة"

export type SchoolFormValues = {
  code: string
  name: string
  type: SchoolType
  city: string
  status: SchoolStatus
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: "create" | "edit"
  form: SchoolFormValues
  onChange: (values: SchoolFormValues) => void
  onSubmit: () => void
  trigger?: ReactNode
}

export default function SchoolFormDialog({
  open,
  onOpenChange,
  mode,
  form,
  onChange,
  onSubmit,
  trigger,
}: Props) {
  const isEdit = mode === "edit"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}

      <DialogContent className="sm:max-w-lg">
        <DialogHeader className="text-right">
          <DialogTitle>{isEdit ? "تعديل مدرسة" : "إضافة مدرسة"}</DialogTitle>
          <DialogDescription>
            أدخل البيانات الأساسية للمدرسة.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <label className="text-sm font-medium">كود المدرسة</label>
            <Input
              value={form.code}
              onChange={(e) =>
                onChange({
                  ...form,
                  code: e.target.value,
                })
              }
              placeholder="مثال: MN-B-02"
              className="rounded-xl"
            />
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium">اسم المدرسة</label>
            <Input
              value={form.name}
              onChange={(e) =>
                onChange({
                  ...form,
                  name: e.target.value,
                })
              }
              placeholder="اكتب اسم المدرسة"
              className="rounded-xl"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <label className="text-sm font-medium">النوع</label>
              <select
                value={form.type}
                onChange={(e) =>
                  onChange({
                    ...form,
                    type: e.target.value as SchoolType,
                  })
                }
                className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
              >
                <option value="بنين">بنين</option>
                <option value="بنات">بنات</option>
                <option value="روضة">روضة</option>
              </select>
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium">الحالة</label>
              <select
                value={form.status}
                onChange={(e) =>
                  onChange({
                    ...form,
                    status: e.target.value as SchoolStatus,
                  })
                }
                className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
              >
                <option value="نشطة">نشطة</option>
                <option value="مؤرشفة">مؤرشفة</option>
              </select>
            </div>
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium">المدينة</label>
            <Input
              value={form.city}
              onChange={(e) =>
                onChange({
                  ...form,
                  city: e.target.value,
                })
              }
              placeholder="الرياض"
              className="rounded-xl"
            />
          </div>
        </div>

        <DialogFooter className="flex-row-reverse gap-2 sm:justify-start">
          <Button onClick={onSubmit} className="rounded-xl">
            {isEdit ? "حفظ التعديلات" : "حفظ"}
          </Button>

          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="rounded-xl"
          >
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}