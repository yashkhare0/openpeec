import { useState } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { InlineEmpty } from "./EmptyState";

type TrendPoint = {
  label: string;
  visibility: number;
  citation: number;
  coverage: number;
};

const chartConfig = {
  visibility: {
    label: "Visibility",
    color: "oklch(0.623 0.214 259.815)",
  },
  citation: {
    label: "Citation Quality",
    color: "oklch(0.705 0.213 47.604)",
  },
  coverage: {
    label: "Coverage",
    color: "oklch(0.627 0.194 149.214)",
  },
} satisfies ChartConfig;

type SeriesKey = "visibility" | "citation" | "coverage";

export function TrendChart({ trend }: { trend: TrendPoint[] }) {
  const [activeSeries, setActiveSeries] = useState<SeriesKey>("visibility");

  const allSeries: SeriesKey[] = ["visibility", "citation", "coverage"];

  if (trend.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Trend</CardTitle>
          <CardDescription>
            Visibility, citations, and coverage over time.
          </CardDescription>
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
        <CardTitle>Trend</CardTitle>
        <CardDescription>
          Visibility, citations, and coverage over time.
        </CardDescription>
        <CardAction>
          <ToggleGroup
            type="single"
            value={activeSeries}
            onValueChange={(v) => {
              if (v) setActiveSeries(v as SeriesKey);
            }}
            variant="outline"
            className="gap-1"
          >
            {allSeries.map((key) => (
              <ToggleGroupItem
                key={key}
                value={key}
                className="h-7 px-2.5 text-xs capitalize"
              >
                <div
                  className="mr-1.5 size-2 rounded-full"
                  style={{ background: chartConfig[key].color }}
                />
                {chartConfig[key].label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </CardAction>
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
                strokeWidth={activeSeries === key ? 2.5 : 1.5}
                strokeOpacity={activeSeries === key ? 1 : 0.3}
                dot={false}
                activeDot={activeSeries === key ? { r: 4 } : false}
              />
            ))}
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
