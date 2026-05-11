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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  selectedRunId: Id<"promptRuns"> | null;
  onOpenRun: (value: Id<"promptRuns">) => void;
  onOpenRunGroup?: (value: string) => void;
}) {
  if (loading) {
    return (
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
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
  const hasCapturedSources = promptAnalysis.responses.some(
    (response) =>
      (response.sourceCount ?? response.sourceDomains.length) > 0 ||
      response.sourceDomains.length > 0
  );

  return (
    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      <div className="grid gap-4 px-4 lg:px-6 xl:grid-cols-[minmax(0,1.1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-4">
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

          <Card className="min-w-0">
            <CardHeader className="pb-2">
              <CardTitle>Responses</CardTitle>
            </CardHeader>
            <CardContent>
              {promptAnalysis.responses.length === 0 ? (
                <InlineEmpty text="No responses captured for this prompt." />
              ) : (
                <Table className="min-w-[900px] table-fixed">
                  <colgroup>
                    <col className="w-[150px]" />
                    <col className="w-[150px]" />
                    <col />
                    <col className="w-[96px]" />
                    <col className="w-[104px]" />
                    <col className="w-[88px]" />
                    <col className="w-8" />
                  </colgroup>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Provider</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Summary</TableHead>
                      <TableHead className="text-right">Sources</TableHead>
                      <TableHead className="text-right">Citation</TableHead>
                      <TableHead>Started</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {promptAnalysis.responses.map((response) => {
                      const sourceCount =
                        response.sourceCount ?? response.sourceDomains.length;
                      const openResponse = () => {
                        if (response.runGroupId && onOpenRunGroup) {
                          onOpenRunGroup(response.runGroupId);
                          return;
                        }
                        onOpenRun(response.id);
                      };

                      return (
                        <TableRow
                          key={String(response.id)}
                          role="button"
                          tabIndex={0}
                          aria-label={`Open ${response.providerName} response from ${formatFreshness(
                            response.startedAt
                          )}`}
                          className={cn(
                            clickableTableRowClassName,
                            selectedRunId === response.id && "bg-muted/30"
                          )}
                          onClick={openResponse}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              openResponse();
                            }
                          }}
                        >
                          <TableCell>
                            <div className="min-w-0">
                              <p className="truncate font-medium">
                                {response.providerName}
                              </p>
                              <p className="text-muted-foreground truncate text-xs">
                                {response.providerSlug}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1.5">
                              <Badge variant="secondary">
                                {titleCase(response.status)}
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
                            </div>
                          </TableCell>
                          <TableCell className="whitespace-normal">
                            <p className="line-clamp-2">
                              {response.responseSummary ||
                                response.responseTextPreview ||
                                "No response summary available."}
                            </p>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {sourceCount}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatScore(response.citationQualityScore)}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {formatFreshness(response.startedAt)}
                          </TableCell>
                          <TableCell className="text-right">
                            <ChevronRight className="text-muted-foreground inline-block" />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Card className="min-w-0">
            <CardHeader className="pb-2">
              <CardTitle>Source Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              {promptAnalysis.sourceBreakdown.length === 0 ? (
                <InlineEmpty
                  text={
                    hasCapturedSources
                      ? "No source breakdown for this prompt yet."
                      : "No cited sources captured for this prompt yet."
                  }
                />
              ) : (
                <Table className="min-w-[560px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Domain</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Citations</TableHead>
                      <TableHead className="text-right">Quality</TableHead>
                      <TableHead className="text-right">Latest</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {promptAnalysis.sourceBreakdown
                      .slice(0, 8)
                      .map((source) => {
                        const latestResponse = source.latestResponses[0];
                        return (
                          <TableRow key={source.domain}>
                            <TableCell>
                              <div className="min-w-0">
                                <p className="truncate font-medium">
                                  {source.domain}
                                </p>
                                <p className="text-muted-foreground text-xs">
                                  {source.responseCount} responses
                                </p>
                              </div>
                            </TableCell>
                            <TableCell>{titleCase(source.type)}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {source.citationCount}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatScore(source.avgQualityScore)}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-right">
                              {latestResponse
                                ? formatFreshness(latestResponse.startedAt)
                                : "-"}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                  </TableBody>
                </Table>
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
