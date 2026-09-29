import type { MeasurementClassSummary } from "@/lib/measurement-class-summary";
import { formatMeasurementClassSummaryNumber } from "@/lib/measurement-class-summary";

function formatAverageScore(summary: MeasurementClassSummary) {
  if (summary.averageScore === null) return "—";

  const maxScore =
    summary.maxScore === null
      ? "—"
      : formatMeasurementClassSummaryNumber(summary.maxScore);

  return `${formatMeasurementClassSummaryNumber(summary.averageScore)} من ${maxScore}`;
}

function formatPercentage(summary: MeasurementClassSummary) {
  if (summary.percentage === null) return "—";
  return `${formatMeasurementClassSummaryNumber(summary.percentage)}%`;
}

export function ClassAverageSummary({
  summary,
  className = "",
}: {
  summary: MeasurementClassSummary;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border bg-card p-5 text-card-foreground shadow-sm ${className}`}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryValue label="متوسط الفصل" value={formatAverageScore(summary)} />
        <SummaryValue label="النسبة المئوية" value={formatPercentage(summary)} />
        <SummaryValue
          label="المحتسبون"
          value={`${formatMeasurementClassSummaryNumber(summary.includedCount)} من ${formatMeasurementClassSummaryNumber(summary.totalStudentCount)} طالبًا`}
        />
      </div>
    </section>
  );
}

function SummaryValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/40 p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-xl font-bold">{value}</p>
    </div>
  );
}
