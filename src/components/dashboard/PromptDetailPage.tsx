import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts";
import { ChevronRight } from "lucide-react";
import type { Id } from "../../../convex/_generated/dataModel";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { cn } from "@/lib/utils";
import { InlineEmpty } from "./components/EmptyState";
import {
  clickableTableRowClassName,
  InfoTooltip,
} from "./components/InfoTooltip";
import {
  DashboardCardSkeleton,
  DashboardListSkeleton,
  DashboardMetricCardsSkeleton,
} from "./components/LoadingState";

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
  citation: { label: "Citation quality", color: "var(--chart-2)" },
  sources: { label: "Sources", color: "var(--chart-3)" },
} satisfies ChartConfig;

const sourceChartConfig = {
  citations: { label: "Citations", color: "var(--chart-4)" },
} satisfies ChartConfig;

export function PromptDetailPage({
  loading = false,
  promptAnalysis,
  onBack,
  selectedRunId,
  onOpenRun,
  onOpenRunGroup,
}: {
  loading?: boolean;
  promptAnalysis:
    | {
        prompt: {
          _id: Id<"prompts">;
          excerpt: string;
          promptText: string;
        };
        summary: {
          responseCount: number;
          sourceDiversity: number;
          responseDrift?: number;
          sourceVariance?: number;
        };
        responses: Array<{
          id: Id<"promptRuns">;
          runGroupId?: string;
          status: string;
          startedAt: number;
          finishedAt?: number;
          providerSlug: string;
          providerName: string;
          providerUrl: string;
          attempt?: number;
          citationQualityScore?: number;
          averageCitationPosition?: number;
          visibilityScore?: number;
          responseSummary?: string;
          responseTextPreview: string;
          sourceCount?: number;
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
          entityId?: Id<"trackedEntities">;
          name: string;
          kind: string;
          mentionCount: number;
          citationCount: number;
          responseCount: number;
        }>;
      }
    | null
    | undefined;
  onBack: () => void;
  selectedRunId: Id<"promptRuns"> | null;
  onOpenRun: (value: Id<"promptRuns">) => void;
  onOpenRunGroup?: (value: string) => void;
}) {
  if (loading) {
    return (
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <div className="flex items-center gap-2 px-4 lg:px-6">
          <Button variant="outline" size="sm" onClick={onBack}>
            Back to prompts
          </Button>
        </div>

        <div className="grid gap-4 px-4 lg:px-6 xl:grid-cols-[minmax(0,1.1fr)_380px]">
          <div className="flex flex-col gap-4">
            <DashboardCardSkeleton
              titleWidth="w-40"
              descriptionWidth="w-full max-w-2xl"
              contentClassName="space-y-4"
            >
              <DashboardMetricCardsSkeleton count={4} />
            </DashboardCardSkeleton>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
              <DashboardCardSkeleton
                titleWidth="w-36"
                descriptionWidth="w-64"
                contentClassName="space-y-3"
              >
                <div className="bg-muted/40 h-[280px] rounded-xl" />
              </DashboardCardSkeleton>
              <DashboardCardSkeleton
                titleWidth="w-32"
                descriptionWidth="w-56"
                contentClassName="space-y-3"
              >
                <div className="bg-muted/40 h-[280px] rounded-xl" />
              </DashboardCardSkeleton>
            </div>

            <DashboardCardSkeleton
              titleWidth="w-24"
              descriptionWidth="w-72"
              contentClassName="space-y-3"
            >
              <DashboardListSkeleton items={4} />
            </DashboardCardSkeleton>
          </div>

          <DashboardCardSkeleton
            titleWidth="w-32"
            descriptionWidth="w-60"
            contentClassName="space-y-3"
          >
            <DashboardListSkeleton items={4} />
          </DashboardCardSkeleton>
        </div>
      </div>
    );
  }

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
      citation: response.citationQualityScore,
      sources: response.sourceCount ?? response.sourceDomains.length,
    }));

  const sourceSeries = promptAnalysis.sourceBreakdown
    .slice(0, 8)
    .map((source) => ({
      label: source.domain,
      citations: source.citationCount,
    }));
  const hasResponseChart =
    responseSeries.filter(
      (point) => point.citation !== undefined || point.sources > 0
    ).length > 1;
  const hasSourceChart =
    sourceSeries.filter((point) => point.citations > 0).length > 1;
  const hasCharts = hasResponseChart || hasSourceChart;
  const promptTitle =
    promptAnalysis.prompt.excerpt.trim() ||
    promptAnalysis.prompt.promptText.trim() ||
    "Prompt";
  const promptBody = promptAnalysis.prompt.promptText.trim();
  const showPromptBody = promptBody.length > 0 && promptBody !== promptTitle;

  return (
    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      <div className="flex items-center gap-2 px-4 lg:px-6">
        <Button variant="outline" size="sm" onClick={onBack}>
          Back to prompts
        </Button>
      </div>

      <div className="grid gap-4 px-4 lg:px-6 xl:grid-cols-[minmax(0,1.1fr)_380px]">
        <div className="flex flex-col gap-4">
          <section className="space-y-4">
            <div className="max-w-3xl space-y-2">
              <h1 className="text-xl font-semibold tracking-tight">
                {promptTitle}
              </h1>
              {showPromptBody ? (
                <p className="text-muted-foreground text-sm">{promptBody}</p>
              ) : null}
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <MetricTile
                label="Responses"
                value={String(promptAnalysis.summary.responseCount)}
                detail="Answers"
              />
              <MetricTile
                label="Unique Sources"
                value={String(promptAnalysis.summary.sourceDiversity)}
                detail="Domains"
              />
              <MetricTile
                label="Response Variance"
                value={formatPercent(promptAnalysis.summary.responseDrift)}
                detail="Answer drift"
                tooltip="Estimated change in answer content across captures."
              />
              <MetricTile
                label="Source Variance"
                value={formatPercent(promptAnalysis.summary.sourceVariance)}
                detail="Citation drift"
                tooltip="Estimated change in cited domains across captures."
              />
            </div>
          </section>

          {hasCharts ? (
            <div
              className={cn(
                "grid gap-4",
                hasResponseChart &&
                  hasSourceChart &&
                  "xl:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]"
              )}
            >
              {hasResponseChart ? (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle>Response Variance</CardTitle>
                  </CardHeader>
                  <CardContent>
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
                  </CardContent>
                </Card>
              ) : null}

              {hasSourceChart ? (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle>Top Sources Used</CardTitle>
                  </CardHeader>
                  <CardContent>
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
                  </CardContent>
                </Card>
              ) : null}
            </div>
          ) : null}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Responses</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {promptAnalysis.responses.length === 0 ? (
                <InlineEmpty text="No responses captured for this prompt." />
              ) : (
                promptAnalysis.responses.map((response) => {
                  const sourceCount =
                    response.sourceCount ?? response.sourceDomains.length;
                  const hasCaptureDetails =
                    response.warnings.length > 0 ||
                    Boolean(response.evidencePath) ||
                    response.attempt !== undefined;
                  const openResponse = () => {
                    if (response.runGroupId && onOpenRunGroup) {
                      onOpenRunGroup(response.runGroupId);
                      return;
                    }
                    onOpenRun(response.id);
                  };

                  return (
                    <div
                      key={String(response.id)}
                      className={cn(
                        "bg-card rounded-lg border",
                        selectedRunId === response.id &&
                          "border-primary bg-muted/30"
                      )}
                    >
                      <div
                        role="button"
                        tabIndex={0}
                        aria-label={`Open ${response.providerName} response from ${formatFreshness(
                          response.startedAt
                        )}`}
                        onClick={openResponse}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            openResponse();
                          }
                        }}
                        className={cn(
                          clickableTableRowClassName,
                          "group flex w-full flex-col gap-3 rounded-lg p-3 text-left"
                        )}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1 space-y-1.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="secondary">
                                {titleCase(response.status)}
                              </Badge>
                              <Badge variant="outline">
                                {response.providerName}
                              </Badge>
                              {response.warnings.length > 0 ? (
                                <Badge
                                  variant="outline"
                                  className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                                >
                                  {response.warnings.length} warning
                                  {response.warnings.length === 1 ? "" : "s"}
                                </Badge>
                              ) : null}
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
                          <div className="flex shrink-0 items-center gap-2">
                            <div className="flex flex-wrap justify-end gap-1.5">
                              <Badge variant="outline">
                                {sourceCount} sources
                              </Badge>
                              {response.citationQualityScore !== undefined ? (
                                <Badge variant="outline">
                                  Citation{" "}
                                  {formatScore(response.citationQualityScore)}
                                </Badge>
                              ) : null}
                            </div>
                            <ChevronRight className="text-muted-foreground group-hover:text-foreground size-4 transition-transform group-hover:translate-x-0.5" />
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
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
                      </div>
                      {hasCaptureDetails ? (
                        <details className="border-t px-3 py-2 text-xs">
                          <summary className="text-muted-foreground hover:text-foreground cursor-pointer font-medium">
                            Capture details
                          </summary>
                          <div className="text-muted-foreground mt-2 space-y-2">
                            {response.warnings.length > 0 ? (
                              <div>
                                <p className="text-foreground font-medium">
                                  Warnings
                                </p>
                                <ul className="mt-1 list-disc space-y-1 pl-4">
                                  {response.warnings.map((warning) => (
                                    <li key={`${response.id}-${warning}`}>
                                      {warning}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ) : null}
                            {response.evidencePath ? (
                              <div>
                                <p className="text-foreground font-medium">
                                  Evidence path
                                </p>
                                <code className="bg-muted/40 mt-1 block rounded-md px-2 py-1 break-all">
                                  {response.evidencePath}
                                </code>
                              </div>
                            ) : null}
                            {response.attempt !== undefined ? (
                              <p>
                                Attempt{" "}
                                <span className="text-foreground tabular-nums">
                                  {response.attempt}
                                </span>
                              </p>
                            ) : null}
                          </div>
                        </details>
                      ) : null}
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Source Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              {promptAnalysis.sourceBreakdown.length === 0 ? (
                <InlineEmpty text="No source breakdown for this prompt yet." />
              ) : (
                <div className="divide-y">
                  {promptAnalysis.sourceBreakdown.slice(0, 8).map((source) => (
                    <div key={source.domain} className="py-3 first:pt-0">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">{source.domain}</p>
                          <p className="text-muted-foreground text-xs">
                            {titleCase(source.type)} | {source.responseCount}{" "}
                            responses
                          </p>
                        </div>
                        <div className="flex flex-wrap justify-end gap-1.5">
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
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Brands and Entities</CardTitle>
            </CardHeader>
            <CardContent>
              {promptAnalysis.entityBreakdown.length === 0 ? (
                <InlineEmpty text="No tracked entities matched this prompt's responses yet." />
              ) : (
                <div className="divide-y">
                  {promptAnalysis.entityBreakdown.slice(0, 8).map((entity) => (
                    <div
                      key={
                        entity.entityId
                          ? String(entity.entityId)
                          : `${entity.name}-${entity.kind}`
                      }
                      className="py-3 first:pt-0"
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
                  ))}
                </div>
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
  tooltip,
}: {
  label: string;
  value: string;
  detail: string;
  tooltip?: string;
}) {
  return (
    <div className="bg-muted/20 rounded-lg p-3">
      <div className="text-muted-foreground flex items-center gap-1 text-[11px] font-medium tracking-[0.16em] uppercase">
        <span>{label}</span>
        {tooltip ? (
          <InfoTooltip label={`${label} definition`}>{tooltip}</InfoTooltip>
        ) : null}
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="text-muted-foreground mt-1 text-xs">{detail}</p>
    </div>
  );
}
