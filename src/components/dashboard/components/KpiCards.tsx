import { Card, CardContent } from "@/components/ui/card";
import { Eyebrow } from "@/components/ui/eyebrow";
import { cn } from "@/lib/utils";
import { statusTone, type StatusTone } from "@/lib/statusTone";
import { InfoTooltip } from "./InfoTooltip";
import { DashboardMetricCardsSkeleton } from "./LoadingState";

type Tone = "positive" | "negative" | "neutral";

const TONE_TO_STATUS: Record<Tone, StatusTone> = {
  positive: "success",
  negative: "danger",
  neutral: "neutral",
};

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
              <Eyebrow>{kpi.label}</Eyebrow>
              <InfoTooltip label={`About ${kpi.label}`}>
                {kpiDefinition(kpi.label)}
              </InfoTooltip>
            </div>
            <div className="mt-3 space-y-1">
              <p className="text-2xl font-semibold tabular-nums">{kpi.value}</p>
              <p
                className={cn(
                  "text-sm",
                  statusTone(TONE_TO_STATUS[kpi.tone], "text")
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
