import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { InlineEmpty } from "./EmptyState";
import { DashboardCardSkeleton } from "./LoadingState";

type TrendPoint = {
  label: string;
  citation: number;
  coverage: number;
};

const chartConfig = {
  citation: {
    label: "Citation Quality",
    color: "oklch(0.705 0.213 47.604)",
  },
  coverage: {
    label: "Coverage",
    color: "oklch(0.627 0.194 149.214)",
  },
} satisfies ChartConfig;

type SeriesKey = "citation" | "coverage";

const allSeries: SeriesKey[] = ["citation", "coverage"];

export function TrendChart({
  trend,
  loading = false,
}: {
  trend: TrendPoint[];
  loading?: boolean;
}) {
  if (loading) {
    return (
      <DashboardCardSkeleton
        className="@container/chart"
        titleWidth="w-16"
        showDescription={false}
        contentClassName="px-2 pt-0 sm:px-6"
      >
        <div className="flex justify-end gap-3 pb-4">
          <div className="bg-muted/60 h-4 w-28 animate-pulse rounded-full" />
          <div className="bg-muted/60 h-4 w-24 animate-pulse rounded-full" />
        </div>
        <div className="bg-muted/50 h-[250px] w-full animate-pulse rounded-xl border" />
      </DashboardCardSkeleton>
    );
  }

  if (trend.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <InlineEmpty text="No trend data in this range." />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="@container/chart">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>Trend</CardTitle>
          <div className="text-muted-foreground flex flex-wrap items-center gap-3 text-xs">
            {allSeries.map((key) => (
              <span key={key} className="inline-flex items-center gap-2">
                <span
                  className="size-2 rounded-full"
                  style={{ background: chartConfig[key].color }}
                />
                {chartConfig[key].label}
              </span>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-2 pt-0 sm:px-6">
        <ChartContainer
          config={chartConfig}
          className="aspect-auto h-[250px] w-full"
        >
          <LineChart data={trend} margin={{ left: 0, right: 12, top: 12 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
              className="text-xs"
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              domain={[0, 100]}
              width={32}
              className="text-xs"
            />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent indicator="line" />}
            />
            {allSeries.map((key) => (
              <Line
                key={key}
                dataKey={key}
                type="monotone"
                stroke={chartConfig[key].color}
                strokeWidth={2}
                strokeOpacity={1}
                dot={false}
                activeDot={{ r: 4 }}
              />
            ))}
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
