import { TrendingDown, TrendingUp, Minus } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Tone = "positive" | "negative" | "neutral";

export function KpiCards({
  kpis,
}: {
  kpis: Array<{ label: string; value: string; delta: string; tone: Tone }>;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {kpis.map((kpi) => (
        <Card key={kpi.label}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {kpi.label}
              </p>
              <KpiIcon tone={kpi.tone} />
            </div>
            <div className="mt-3 flex items-end justify-between gap-2">
              <p className="text-2xl font-semibold tabular-nums">
                {kpi.value}
              </p>
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                  kpi.tone === "positive" &&
                    "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                  kpi.tone === "negative" &&
                    "bg-rose-500/10 text-rose-700 dark:text-rose-300",
                  kpi.tone === "neutral" &&
                    "bg-muted text-muted-foreground"
                )}
              >
                {kpi.delta}
              </span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function KpiIcon({ tone }: { tone: Tone }) {
  const className = cn(
    "size-4",
    tone === "positive" && "text-emerald-600 dark:text-emerald-300",
    tone === "negative" && "text-rose-600 dark:text-rose-300",
    tone === "neutral" && "text-muted-foreground"
  );
  if (tone === "positive") return <TrendingUp className={className} />;
  if (tone === "negative") return <TrendingDown className={className} />;
  return <Minus className={className} />;
}
