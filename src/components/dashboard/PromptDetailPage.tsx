import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts";
import type { Id } from "../../../convex/_generated/dataModel";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
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
import { InlineEmpty } from "./components/EmptyState";

function formatPercent(value: number | undefined): string {
  if (value === undefined) return "-";
  return `${Math.round(value)}%`;
}

function formatScore(value: number | undefined): string {
  if (value === undefined) return "-";
  return `${Math.round(value)}`;
}

function formatFreshness(timestamp: number): string {
  const minutes = Math.max(1, Math.round((Date.now() - timestamp) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function titleCase(value: string): string {
  return value
    .split("_")
    .map((item) => item.charAt(0).toUpperCase() + item.slice(1).toLowerCase())
    .join(" ");
}

const responseChartConfig = {
  visibility: { label: "Visibility", color: "var(--chart-1)" },
  citation: { label: "Citation", color: "var(--chart-2)" },
  sources: { label: "Sources", color: "var(--chart-3)" },
} satisfies ChartConfig;

const sourceChartConfig = {
  citations: { label: "Citations", color: "var(--chart-4)" },
} satisfies ChartConfig;

export function PromptDetailPage({
  selectedGroupName,
  promptAnalysis,
  onBack,
  selectedRunId,
  onOpenRun,
}: {
  selectedGroupName?: string;
  promptAnalysis:
    | {
        prompt: {
          _id: Id<"prompts">;
          name: string;
          promptText: string;
          targetModel: string;
        };
        summary: {
          responseCount: number;
          sourceDiversity: number;
          responseDrift?: number;
          sourceVariance?: number;
        };
        responses: Array<{
          id: Id<"promptRuns">;
          status: string;
          startedAt: number;
          finishedAt?: number;
          model: string;
          visibilityScore?: number;
          citationQualityScore?: number;
          averageCitationPosition?: number;
          responseSummary?: string;
          responseTextPreview: string;
          sourceCount: number;
          sourceDomains: string[];
          mentionNames: string[];
          warnings: string[];
          evidencePath?: string;
        }>;
        sourceBreakdown: Array<{
          domain: string;
          type: string;
          citationCount: number;
          responseCount: number;
          avgPosition?: number;
          avgQualityScore?: number;
          ownedShare: number;
          latestResponses: Array<{
            runId: Id<"promptRuns">;
            startedAt: number;
            responseSummary: string;
          }>;
        }>;
        entityBreakdown: Array<{
          entityId: Id<"trackedEntities">;
          name: string;
          kind: string;
          mentionCount: number;
          citationCount: number;
          responseCount: number;
        }>;
      }
    | undefined;
  onBack: () => void;
  selectedRunId: Id<"promptRuns"> | null;
  onOpenRun: (value: Id<"promptRuns">) => void;
}) {
  if (!promptAnalysis) {
    return (
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <div className="px-4 lg:px-6">
          <InlineEmpty text="No prompt analysis available yet." />
        </div>
      </div>
    );
  }

  const responseSeries = promptAnalysis.responses
    .slice()
    .reverse()
    .map((response, index) => ({
      label: `R${index + 1}`,
      visibility: response.visibilityScore ?? 0,
      citation: response.citationQualityScore ?? 0,
      sources: response.sourceCount,
    }));

  const sourceSeries = promptAnalysis.sourceBreakdown
    .slice(0, 8)
    .map((source) => ({
      label: source.domain,
      citations: source.citationCount,
    }));

  return (
    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      <div className="flex items-center gap-2 px-4 lg:px-6">
        <Button variant="outline" size="sm" onClick={onBack}>
          Back to prompts
        </Button>
        {selectedGroupName ? (
          <Badge variant="outline">{selectedGroupName}</Badge>
        ) : null}
        <Badge variant="secondary">{promptAnalysis.prompt.targetModel}</Badge>
      </div>

      <div className="grid gap-4 px-4 lg:px-6 xl:grid-cols-[minmax(0,1.1fr)_380px]">
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>{promptAnalysis.prompt.name}</CardTitle>
              <CardDescription>
                {promptAnalysis.prompt.promptText}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-4">
                <MetricTile
                  label="Responses"
                  value={String(promptAnalysis.summary.responseCount)}
                  detail="Captured answers"
                />
                <MetricTile
                  label="Unique Sources"
                  value={String(promptAnalysis.summary.sourceDiversity)}
                  detail="Distinct domains"
                />
                <MetricTile
                  label="Response Variance"
                  value={formatPercent(promptAnalysis.summary.responseDrift)}
                  detail="How much answers change"
                />
                <MetricTile
                  label="Source Variance"
                  value={formatPercent(promptAnalysis.summary.sourceVariance)}
                  detail="How much citations change"
                />
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
            <Card>
              <CardHeader>
                <CardTitle>Response Variance</CardTitle>
                <CardDescription>
                  Visibility, citation quality, and source count across captured
                  responses.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {responseSeries.length === 0 ? (
                  <InlineEmpty text="No response history yet." />
                ) : (
                  <ChartContainer
                    config={responseChartConfig}
                    className="h-[280px] w-full"
                  >
                    <LineChart
                      data={responseSeries}
                      margin={{ left: 8, right: 16, top: 12 }}
                    >
                      <CartesianGrid vertical={false} />
                      <XAxis
                        dataKey="label"
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis tickLine={false} axisLine={false} width={32} />
                      <ChartTooltip
                        content={<ChartTooltipContent indicator="line" />}
                      />
                      <Line
                        type="monotone"
                        dataKey="visibility"
                        stroke="var(--color-visibility)"
                        strokeWidth={2.5}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="citation"
                        stroke="var(--color-citation)"
                        strokeWidth={2.5}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="sources"
                        stroke="var(--color-sources)"
                        strokeWidth={2.5}
                        dot={false}
                      />
                    </LineChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Top Sources Used</CardTitle>
                <CardDescription>
                  Most-cited domains across this prompt's captured responses.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {sourceSeries.length === 0 ? (
                  <InlineEmpty text="No source breakdown yet." />
                ) : (
                  <ChartContainer
                    config={sourceChartConfig}
                    className="h-[280px] w-full"
                  >
                    <BarChart
                      data={sourceSeries}
                      margin={{ left: 8, right: 16, top: 12 }}
                    >
                      <CartesianGrid vertical={false} />
                      <XAxis
                        dataKey="label"
                        tickLine={false}
                        axisLine={false}
                        interval={0}
                        angle={-18}
                        textAnchor="end"
                        height={70}
                      />
                      <YAxis tickLine={false} axisLine={false} width={32} />
                      <ChartTooltip
                        content={<ChartTooltipContent indicator="dot" />}
                      />
                      <Bar
                        dataKey="citations"
                        fill="var(--color-citations)"
                        radius={8}
                      />
                    </BarChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Responses</CardTitle>
              <CardDescription>
                Open a response to inspect evidence, citations, and entity
                mentions.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {promptAnalysis.responses.length === 0 ? (
                <InlineEmpty text="No responses captured for this prompt." />
              ) : (
                promptAnalysis.responses.map((response) => (
                  <button
                    key={String(response.id)}
                    type="button"
                    onClick={() => onOpenRun(response.id)}
                    className={`hover:border-foreground/30 hover:bg-muted/20 w-full rounded-xl border p-4 text-left transition-colors ${
                      selectedRunId === response.id
                        ? "border-primary bg-muted/30"
                        : ""
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="secondary">
                            {titleCase(response.status)}
                          </Badge>
                          <Badge variant="outline">{response.model}</Badge>
                          <span className="text-muted-foreground text-xs">
                            {formatFreshness(response.startedAt)}
                          </span>
                        </div>
                        <p className="text-foreground/90 line-clamp-2 text-sm">
                          {response.responseSummary ||
                            response.responseTextPreview ||
                            "No response summary available."}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <Badge variant="outline">
                          {response.sourceCount} sources
                        </Badge>
                        {response.visibilityScore !== undefined ? (
                          <Badge variant="outline">
                            Visibility {formatPercent(response.visibilityScore)}
                          </Badge>
                        ) : null}
                        {response.citationQualityScore !== undefined ? (
                          <Badge variant="outline">
                            Citation{" "}
                            {formatScore(response.citationQualityScore)}
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {response.sourceDomains.slice(0, 4).map((domain) => (
                        <Badge
                          key={`${response.id}-${domain}`}
                          variant="outline"
                        >
                          {domain}
                        </Badge>
                      ))}
                      {response.mentionNames.slice(0, 4).map((name) => (
                        <Badge
                          key={`${response.id}-${name}`}
                          variant="secondary"
                        >
                          {name}
                        </Badge>
                      ))}
                    </div>
                    {response.warnings.length ? (
                      <p className="mt-3 text-xs text-amber-700">
                        {response.warnings.join(" | ")}
                      </p>
                    ) : null}
                  </button>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Source Breakdown</CardTitle>
              <CardDescription>
                Which domains are cited, how often, and how strong they are.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {promptAnalysis.sourceBreakdown.length === 0 ? (
                <InlineEmpty text="No source breakdown for this prompt yet." />
              ) : (
                promptAnalysis.sourceBreakdown.slice(0, 8).map((source) => (
                  <div key={source.domain} className="rounded-xl border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{source.domain}</p>
                        <p className="text-muted-foreground text-xs">
                          {titleCase(source.type)} | {source.responseCount}{" "}
                          responses
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <Badge variant="outline">
                          {source.citationCount} citations
                        </Badge>
                        <Badge variant="outline">
                          Owned {formatPercent(source.ownedShare)}
                        </Badge>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {source.avgQualityScore !== undefined ? (
                        <Badge variant="secondary">
                          Quality {formatScore(source.avgQualityScore)}
                        </Badge>
                      ) : null}
                      {source.avgPosition !== undefined ? (
                        <Badge variant="secondary">
                          Avg position #{source.avgPosition.toFixed(1)}
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Brands and Entities</CardTitle>
              <CardDescription>
                What brands or tracked entities are actually surfacing in these
                answers.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {promptAnalysis.entityBreakdown.length === 0 ? (
                <InlineEmpty text="No tracked entities matched this prompt's responses yet." />
              ) : (
                promptAnalysis.entityBreakdown.slice(0, 8).map((entity) => (
                  <div
                    key={String(entity.entityId)}
                    className="rounded-xl border p-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium">{entity.name}</p>
                        <p className="text-muted-foreground text-xs">
                          {titleCase(entity.kind)}
                        </p>
                      </div>
                      <Badge variant="outline">
                        {entity.responseCount} responses
                      </Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <Badge variant="secondary">
                        {entity.mentionCount} mentions
                      </Badge>
                      <Badge variant="secondary">
                        {entity.citationCount} linked citations
                      </Badge>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function MetricTile({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="bg-muted/20 rounded-xl border p-3">
      <p className="text-muted-foreground text-[11px] font-medium tracking-[0.16em] uppercase">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="text-muted-foreground mt-1 text-xs">{detail}</p>
    </div>
  );
}
