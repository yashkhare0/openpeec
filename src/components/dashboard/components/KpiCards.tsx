import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { InfoTooltip } from "./InfoTooltip";
import { DashboardMetricCardsSkeleton } from "./LoadingState";

type Tone = "positive" | "negative" | "neutral";

export function KpiCards({
  kpis,
  loading = false,
}: {
  kpis: Array<{ label: string; value: string; delta: string; tone: Tone }>;
  loading?: boolean;
}) {
  if (loading) {
    return <DashboardMetricCardsSkeleton />;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {kpis.map((kpi) => (
        <Card key={kpi.label} className="shadow-none">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-muted-foreground text-[11px] font-medium tracking-[0.18em] uppercase">
                {kpi.label}
              </p>
              <InfoTooltip label={`About ${kpi.label}`}>
                {kpiDefinition(kpi.label)}
              </InfoTooltip>
            </div>
            <div className="mt-3 space-y-1">
              <p className="text-2xl font-semibold tabular-nums">{kpi.value}</p>
              <p
                className={cn(
                  "text-sm",
                  kpi.tone === "positive" &&
                    "text-emerald-700 dark:text-emerald-300",
                  kpi.tone === "negative" && "text-rose-700 dark:text-rose-300",
                  kpi.tone === "neutral" && "text-muted-foreground"
                )}
              >
                {kpi.delta}
              </p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function kpiDefinition(label: string) {
  switch (label) {
    case "Captured runs":
      return "Terminal runs in this range.";
    case "Citation quality":
      return "Average citation quality for successful responses.";
    case "Source coverage":
      return "Unique cited domains and total citations.";
    case "Run health":
      return "Successful runs divided by total runs.";
    default:
      return "Metric for the selected range.";
  }
}
