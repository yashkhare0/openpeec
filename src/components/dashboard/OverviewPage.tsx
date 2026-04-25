import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { KpiCards } from "./components/KpiCards";
import { EmptyState, InlineEmpty } from "./components/EmptyState";
import {
  DashboardCardSkeleton,
  DashboardTableCardSkeleton,
} from "./components/LoadingState";
import { TrendChart } from "./components/TrendChart";

type Tone = "positive" | "negative" | "neutral";
type TrendPoint = {
  label: string;
  citation: number;
  coverage: number;
};

type OverviewRun = {
  id: string;
  promptExcerpt: string;
  providerName: string;
  status: string;
  startedAt: number;
  finishedAt?: number;
  latencyMs?: number;
  sourceCount?: number;
  citationCount: number;
};

function formatPercent(value: number | undefined): string {
  if (value === undefined) return "-";
  return `${Math.round(value)}%`;
}

export function OverviewPage({
  loading,
  hasData,
  kpis,
  trend,
  overview,
  sources,
  recentRuns,
}: {
  loading: boolean;
  hasData: boolean;
  kpis: Array<{ label: string; value: string; delta: string; tone: Tone }>;
  trend: TrendPoint[];
  overview:
    | {
        promptComparison: Array<{
          promptId: string;
          excerpt: string;
          providerName: string;
          responseCount: number;
          latestStatus: string;
          latestResponseSummary: string;
          sourceDiversity: number;
          responseDrift?: number;
          topEntity?: string;
        }>;
      }
    | undefined;
  sources: Array<{
    domain: string;
    type: string;
    usedShare: number;
    avgCitationsPerRun: number;
    avgQualityScore: number | undefined;
  }>;
  recentRuns: OverviewRun[];
}) {
  if (!loading && !hasData) {
    return (
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <div className="px-4 lg:px-6">
          <EmptyState
            title="No response analytics yet"
            description="Run prompt monitoring locally to capture real responses, cited sources, and brand/entity mentions."
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      <div className="space-y-4 px-4 lg:px-6">
        <KpiCards kpis={kpis} loading={loading} />

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
          <TrendChart trend={trend} loading={loading} />

          {loading ? (
            <DashboardCardSkeleton
              titleWidth="w-28"
              showDescription={false}
              contentClassName="space-y-6"
            >
              <div className="space-y-3">
                <div className="bg-muted/60 h-3 w-20 animate-pulse rounded-sm" />
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div
                      key={`domains-${index}`}
                      className="grid grid-cols-[minmax(0,1fr)_80px] gap-3"
                    >
                      <div className="space-y-2">
                        <div className="bg-muted/60 h-4 w-32 animate-pulse rounded-sm" />
                        <div className="bg-muted/50 h-3 w-16 animate-pulse rounded-sm" />
                      </div>
                      <div className="bg-muted/60 h-4 w-full animate-pulse rounded-sm" />
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <div className="bg-muted/60 h-3 w-28 animate-pulse rounded-sm" />
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div
                      key={`variance-${index}`}
                      className="grid grid-cols-[minmax(0,1fr)_80px] gap-3"
                    >
                      <div className="space-y-2">
                        <div className="bg-muted/60 h-4 w-40 animate-pulse rounded-sm" />
                        <div className="bg-muted/50 h-3 w-20 animate-pulse rounded-sm" />
                      </div>
                      <div className="bg-muted/60 h-4 w-full animate-pulse rounded-sm" />
                    </div>
                  ))}
                </div>
              </div>
            </DashboardCardSkeleton>
          ) : (
            <Card className="shadow-none">
              <CardHeader>
                <CardTitle>What changed</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <p className="text-muted-foreground mb-3 text-[11px] font-medium tracking-[0.18em] uppercase">
                    Top domains
                  </p>
                  {sources.length === 0 ? (
                    <InlineEmpty text="No source data yet." />
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Domain</TableHead>
                          <TableHead className="text-right">Used</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sources.slice(0, 4).map((source) => (
                          <TableRow key={source.domain}>
                            <TableCell>
                              <div className="space-y-1">
                                <p className="font-medium">{source.domain}</p>
                                <p className="text-muted-foreground text-xs">
                                  {source.type}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatPercent(source.usedShare)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>

                <div>
                  <p className="text-muted-foreground mb-3 text-[11px] font-medium tracking-[0.18em] uppercase">
                    Prompt variance
                  </p>
                  {(overview?.promptComparison?.length ?? 0) === 0 ? (
                    <InlineEmpty text="No prompt comparison data yet." />
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Prompt</TableHead>
                          <TableHead className="text-right">Drift</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {overview?.promptComparison.slice(0, 4).map((row) => (
                          <TableRow key={row.promptId}>
                            <TableCell>
                              <div className="space-y-1">
                                <p className="font-medium">{row.excerpt}</p>
                                <p className="text-muted-foreground text-xs">
                                  {row.providerName} | {row.responseCount}{" "}
                                  responses
                                </p>
                              </div>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatPercent(row.responseDrift)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {loading ? (
          <DashboardTableCardSkeleton
            titleWidth="w-24"
            showControls={false}
            rows={4}
            columns={5}
          />
        ) : (
          <Card className="shadow-none">
            <CardHeader>
              <CardTitle>Recent runs</CardTitle>
            </CardHeader>
            <CardContent>
              {recentRuns.length === 0 ? (
                <InlineEmpty text="No runs captured yet." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Started</TableHead>
                      <TableHead>Prompt</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Runtime</TableHead>
                      <TableHead className="text-right">Sources</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentRuns.slice(0, 4).map((run) => (
                      <TableRow key={run.id}>
                        <TableCell>
                          <div className="space-y-1">
                            <p className="font-medium">
                              {formatFreshness(run.startedAt)}
                            </p>
                            <p className="text-muted-foreground text-xs">
                              {formatTimestamp(run.startedAt)}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">
                          {run.promptExcerpt}
                        </TableCell>
                        <TableCell>
                          <span className={statusClassName(run.status)}>
                            {titleCase(run.status)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatRuntime(run)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {run.sourceCount ?? run.citationCount}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function getRuntimeMs(
  run: Pick<OverviewRun, "latencyMs" | "startedAt" | "finishedAt">
) {
  if (typeof run.latencyMs === "number") {
    return run.latencyMs;
  }
  if (typeof run.finishedAt === "number") {
    return Math.max(0, run.finishedAt - run.startedAt);
  }
  return undefined;
}

function formatRuntime(
  run: Pick<OverviewRun, "latencyMs" | "startedAt" | "finishedAt">
) {
  const value = getRuntimeMs(run);
  if (value === undefined) return "-";
  if (value < 1000) return `${Math.round(value)}ms`;
  const seconds = value / 1000;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds % 60);
  return `${minutes}m ${remainder}s`;
}

function statusClassName(status: string) {
  if (status === "success") {
    return "text-sm font-medium text-emerald-700 dark:text-emerald-300";
  }
  if (status === "failed") {
    return "text-sm font-medium text-rose-700 dark:text-rose-300";
  }
  if (status === "running") {
    return "text-sm font-medium text-blue-700 dark:text-blue-300";
  }
  if (status === "queued") {
    return "text-sm font-medium text-amber-700 dark:text-amber-300";
  }
  return "text-sm font-medium";
}

function titleCase(value: string) {
  return value
    .split("_")
    .map((item) => item.charAt(0).toUpperCase() + item.slice(1).toLowerCase())
    .join(" ");
}

function formatFreshness(timestamp: number) {
  const minutes = Math.max(1, Math.round((Date.now() - timestamp) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function formatTimestamp(timestamp: number) {
  return new Date(timestamp).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
