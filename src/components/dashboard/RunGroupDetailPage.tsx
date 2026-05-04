import { useState, type KeyboardEvent } from "react";
import { AlertTriangleIcon, ArrowUpRightIcon } from "lucide-react";
import { Cell, Pie, PieChart } from "recharts";
import type { Id } from "../../../convex/_generated/dataModel";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  clickableTableRowClassName,
  InfoTooltip,
} from "./components/InfoTooltip";
import { InlineEmpty } from "./components/EmptyState";
import { DashboardCardSkeleton } from "./components/LoadingState";

type BrowserEngine = "playwright" | "camoufox" | "nodriver";

type RunGroupDetail = {
  group: {
    id: string;
    promptId: Id<"prompts">;
    promptExcerpt: string;
    runLabel?: string;
    queuedAt: number;
    startedAt: number;
    finishedAt?: number;
    status: string;
    providerCount: number;
    sourceCount: number;
    citationCount: number;
  };
  prompt: {
    _id: Id<"prompts">;
    excerpt: string;
    promptText: string;
  } | null;
  runs: Array<{
    _id: Id<"promptRuns">;
    providerSlug: string;
    providerName: string;
    providerUrl: string;
    channelName?: string;
    sessionMode?: "guest" | "stored";
    browserEngine?: BrowserEngine;
    status: string;
    startedAt: number;
    finishedAt?: number;
    latencyMs?: number;
    responseText?: string;
    responseSummary?: string;
    sourceCount?: number;
    evidencePath?: string;
    warnings?: string[];
    runner?: string;
    citations: Array<{
      domain: string;
      url: string;
      title?: string;
      snippet?: string;
      position: number;
    }>;
    mentions: Array<{
      name: string;
      kind: string;
      mentionCount: number;
      citationCount: number;
    }>;
  }>;
};

export function RunGroupDetailPage({
  loading = false,
  runGroupDetail,
  onOpenRun,
  onOpenSourcesForPrompt,
}: {
  loading?: boolean;
  runGroupDetail: RunGroupDetail | null | undefined;
  onOpenRun?: (runId: Id<"promptRuns">) => void;
  onOpenSourcesForPrompt?: (
    promptId: Id<"prompts">,
    promptExcerpt: string
  ) => void;
}) {
  const [selectedRunId, setSelectedRunId] = useState<Id<"promptRuns"> | null>(
    null
  );

  if (loading) {
    return (
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <div className="px-4 lg:px-6">
          <DashboardCardSkeleton
            titleWidth="w-40"
            descriptionWidth="w-72"
            contentClassName="flex flex-col gap-4"
          >
            <div className="bg-muted/40 h-40 rounded-md" />
          </DashboardCardSkeleton>
        </div>
      </div>
    );
  }

  if (!runGroupDetail) {
    return (
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <div className="px-4 lg:px-6">
          <InlineEmpty text="Run group not found." />
        </div>
      </div>
    );
  }

  const promptId = runGroupDetail.prompt?._id ?? runGroupDetail.group.promptId;
  const promptTitle =
    runGroupDetail.prompt?.excerpt ?? runGroupDetail.group.promptExcerpt;
  const promptText =
    runGroupDetail.prompt?.promptText ?? runGroupDetail.group.promptExcerpt;
  const showPromptText = promptText.trim() !== promptTitle.trim();
  const selectedRun =
    runGroupDetail.runs.find((run) => run._id === selectedRunId) ??
    runGroupDetail.runs[0];

  return (
    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      <div className="flex flex-col gap-4 px-4 lg:px-6">
        <section className="flex flex-col gap-4 border-b pb-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl leading-tight font-semibold">
                {promptTitle}
              </h1>
              {showPromptText ? (
                <p className="text-muted-foreground mt-2 line-clamp-2 max-w-3xl text-sm">
                  {promptText}
                </p>
              ) : null}
            </div>
            <Badge
              variant="outline"
              className={statusTone(runGroupDetail.group.status)}
            >
              {titleCase(runGroupDetail.group.status)}
            </Badge>
          </div>
          <div className="grid gap-x-6 gap-y-3 sm:grid-cols-4">
            <MetricTile
              label="Providers"
              value={String(runGroupDetail.group.providerCount)}
            />
            <MetricTile
              label="Sources"
              value={String(runGroupDetail.group.sourceCount)}
            />
            <MetricTile
              label="Citations"
              value={String(runGroupDetail.group.citationCount)}
            />
            <MetricTile
              label="Runtime"
              value={formatGroupRuntime(runGroupDetail)}
            />
          </div>
        </section>

        <ProviderComparison
          runs={runGroupDetail.runs}
          selectedRun={selectedRun}
          onSelectRun={setSelectedRunId}
          promptId={promptId}
          promptTitle={promptTitle}
          onOpenSourcesForPrompt={onOpenSourcesForPrompt}
        />

        {runGroupDetail.runs.length ? (
          <ProviderResponseTabs
            runs={runGroupDetail.runs}
            selectedRun={selectedRun}
            onSelectRun={setSelectedRunId}
            onOpenRun={onOpenRun}
          />
        ) : (
          <InlineEmpty text="No provider responses are available yet." />
        )}
      </div>
    </div>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-muted-foreground text-xs font-medium uppercase">
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-semibold tabular-nums">
        {value}
      </p>
    </div>
  );
}

type ProviderRun = RunGroupDetail["runs"][number];

type ComparisonSlice = {
  key: "similar" | "different" | "shared" | "unique" | "none";
  name: string;
  value: number;
  fill: string;
};

const comparisonChartConfig = {
  similar: {
    label: "Similar",
    color: "var(--chart-2)",
  },
  different: {
    label: "Different",
    color: "var(--chart-4)",
  },
  shared: {
    label: "Shared",
    color: "var(--chart-1)",
  },
  unique: {
    label: "Provider-specific",
    color: "var(--chart-3)",
  },
  none: {
    label: "No data",
    color: "var(--muted)",
  },
};

function ProviderComparison({
  runs,
  selectedRun,
  onSelectRun,
  promptId,
  promptTitle,
  onOpenSourcesForPrompt,
}: {
  runs: ProviderRun[];
  selectedRun: ProviderRun | undefined;
  onSelectRun: (value: Id<"promptRuns">) => void;
  promptId: Id<"prompts">;
  promptTitle: string;
  onOpenSourcesForPrompt?: (
    promptId: Id<"prompts">,
    promptExcerpt: string
  ) => void;
}) {
  const comparison = buildComparisonMetrics(runs);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Provider comparison</CardTitle>
          <InfoTooltip label="Provider comparison sources">
            <SourceComparisonTooltip
              runs={runs}
              promptId={promptId}
              promptTitle={promptTitle}
              onOpenSourcesForPrompt={onOpenSourcesForPrompt}
            />
          </InfoTooltip>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.8fr)]">
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead>Provider</TableHead>
                <TableHead className="w-[118px]">Status</TableHead>
                <TableHead className="w-[96px] text-right">Runtime</TableHead>
                <TableHead className="w-[72px] text-right">Sources</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((run) => {
                const selected = selectedRun?._id === run._id;
                const sourceCount = run.sourceCount ?? run.citations.length;

                return (
                  <TableRow
                    key={String(run._id)}
                    tabIndex={0}
                    aria-label={`Select ${run.providerName} response`}
                    aria-selected={selected}
                    className={cn(
                      clickableTableRowClassName,
                      selected && "bg-muted/35"
                    )}
                    onClick={() => onSelectRun(run._id)}
                    onKeyDown={(event) =>
                      handleProviderRowKeyDown(event, run._id, onSelectRun)
                    }
                  >
                    <TableCell className="whitespace-normal">
                      <div className="truncate font-medium">
                        {run.providerName}
                      </div>
                      <div className="text-muted-foreground truncate text-xs">
                        {run.channelName ?? "Default channel"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={statusTone(run.status)}
                      >
                        {titleCase(run.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatRuntime(run)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {sourceCount}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          <div className="grid gap-3 sm:grid-cols-2">
            <ComparisonPie
              title="Response similarity"
              valueLabel={
                comparison.responseSimilarity === undefined
                  ? "Needs 2 responses"
                  : `${comparison.responseSimilarity}% similar`
              }
              data={comparison.responseSlices}
            />
            <ComparisonPie
              title="Source overlap"
              valueLabel={
                comparison.totalSourceDomains
                  ? `${comparison.sharedSourceDomains} shared / ${comparison.uniqueSourceDomains} unique`
                  : "No sources captured"
              }
              data={comparison.sourceSlices}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function handleProviderRowKeyDown(
  event: KeyboardEvent<HTMLTableRowElement>,
  runId: Id<"promptRuns">,
  onSelectRun: (value: Id<"promptRuns">) => void
) {
  if (event.target !== event.currentTarget) return;
  if (event.key !== "Enter" && event.key !== " ") return;

  event.preventDefault();
  onSelectRun(runId);
}

function ProviderResponseTabs({
  runs,
  selectedRun,
  onSelectRun,
  onOpenRun,
}: {
  runs: ProviderRun[];
  selectedRun: ProviderRun | undefined;
  onSelectRun: (value: Id<"promptRuns">) => void;
  onOpenRun?: (runId: Id<"promptRuns">) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Provider responses</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Tabs
          value={selectedRun ? String(selectedRun._id) : undefined}
          onValueChange={(value) => onSelectRun(value as Id<"promptRuns">)}
          className="flex flex-col gap-4"
        >
          <TabsList
            variant="line"
            className="w-full justify-start overflow-x-auto"
          >
            {runs.map((run) => (
              <TabsTrigger
                key={String(run._id)}
                value={String(run._id)}
                className="max-w-[220px] justify-start"
              >
                <span className="truncate">{run.providerName}</span>
                <Badge variant="outline" className={statusTone(run.status)}>
                  {titleCase(run.status)}
                </Badge>
              </TabsTrigger>
            ))}
          </TabsList>

          {runs.map((run) => (
            <TabsContent
              key={String(run._id)}
              value={String(run._id)}
              className="mt-4"
            >
              <ProviderResponsePanel run={run} onOpenRun={onOpenRun} />
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}

function ProviderResponsePanel({
  run,
  onOpenRun,
}: {
  run: ProviderRun;
  onOpenRun?: (runId: Id<"promptRuns">) => void;
}) {
  const sourceCount = run.sourceCount ?? run.citations.length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="outline" className={statusTone(run.status)}>
          {titleCase(run.status)}
        </Badge>
        <Badge variant="outline">{formatRuntime(run)}</Badge>
        <Badge variant="outline">{sourceCount} sources</Badge>
      </div>

      <ResponseTextPanel run={run} />

      {onOpenRun ? (
        <div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenRun(run._id)}
          >
            Open response
            <ArrowUpRightIcon data-icon="inline-end" />
          </Button>
        </div>
      ) : null}

      <ProviderSources run={run} />

      {run.mentions.length ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">Entity mentions</p>
          <div className="flex flex-wrap gap-1.5">
            {run.mentions.map((mention) => (
              <Badge key={`${run._id}-${mention.name}`} variant="outline">
                {mention.name} - {mention.mentionCount}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}

      <RunContextDetails run={run} />

      {run.warnings?.length ? (
        <details className="rounded-md border p-3 text-xs">
          <summary className="text-muted-foreground cursor-pointer font-medium">
            Runner notes
          </summary>
          <div className="text-muted-foreground mt-2 flex flex-col gap-2">
            {run.warnings.map((warning, index) => (
              <p key={`${warning}-${index}`}>{warning}</p>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function ResponseTextPanel({ run }: { run: ProviderRun }) {
  const content = run.responseText?.trim() || run.responseSummary?.trim();

  if (!content) {
    return <InlineEmpty text="No response text captured." />;
  }

  if (run.status === "blocked" || run.status === "failed") {
    return (
      <section className="flex flex-col gap-2">
        <p className="text-sm font-medium">Answer</p>
        <Alert
          variant={run.status === "failed" ? "destructive" : "default"}
          className={cn(
            run.status === "blocked" &&
              "border-amber-500/20 bg-amber-500/10 text-amber-900 dark:text-amber-100"
          )}
        >
          <AlertTriangleIcon />
          <AlertTitle>{titleCase(run.status)}</AlertTitle>
          <AlertDescription className="whitespace-pre-wrap">
            {content}
          </AlertDescription>
        </Alert>
      </section>
    );
  }

  const isLongAnswer = content.length > 1200;

  if (!isLongAnswer) {
    return (
      <section className="flex flex-col gap-2">
        <p className="text-sm font-medium">Answer</p>
        <div className="bg-muted/20 max-h-[28rem] overflow-y-auto rounded-md border p-3">
          <p className="text-sm leading-6 whitespace-pre-wrap">{content}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-2">
      <p className="text-sm font-medium">Answer</p>
      <div className="bg-muted/20 rounded-md border p-3">
        <p className="line-clamp-8 text-sm leading-6 whitespace-pre-wrap">
          {content}
        </p>
        <details className="mt-3 border-t pt-3">
          <summary className="text-muted-foreground cursor-pointer text-xs font-medium">
            Show full answer
          </summary>
          <div className="mt-3 max-h-[28rem] overflow-y-auto pr-2">
            <p className="text-sm leading-6 whitespace-pre-wrap">{content}</p>
          </div>
        </details>
      </div>
    </section>
  );
}

function ProviderSources({ run }: { run: ProviderRun }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">Sources</p>
        <span className="text-muted-foreground text-xs tabular-nums">
          {run.citations.length}
        </span>
      </div>
      <Table className="table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead className="w-[72px]">Position</TableHead>
            <TableHead>Source</TableHead>
            <TableHead className="w-[140px]">Domain</TableHead>
            <TableHead className="w-[64px] text-right">Open</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {run.citations.length ? (
            run.citations.map((citation) => (
              <TableRow key={`${run._id}-${citation.position}-${citation.url}`}>
                <TableCell>
                  <Badge variant="outline">#{citation.position}</Badge>
                </TableCell>
                <TableCell className="whitespace-normal">
                  <div className="min-w-0">
                    <p className="line-clamp-1 font-medium">
                      {citation.title || citation.domain || citation.url}
                    </p>
                    {citation.snippet ? (
                      <p className="text-muted-foreground mt-1 line-clamp-2 text-xs leading-5">
                        {citation.snippet}
                      </p>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground truncate text-xs">
                  {getCitationDomain(citation)}
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon-sm" asChild>
                    <a
                      href={citation.url}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Open source ${citation.title || citation.domain || citation.url}`}
                    >
                      <ArrowUpRightIcon />
                    </a>
                  </Button>
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell
                colSpan={4}
                className="text-muted-foreground h-16 text-center"
              >
                No sources captured for this provider.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </section>
  );
}

function ComparisonPie({
  title,
  valueLabel,
  data,
}: {
  title: string;
  valueLabel: string;
  data: ComparisonSlice[];
}) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{title}</p>
          <p className="text-muted-foreground mt-0.5 truncate text-xs">
            {valueLabel}
          </p>
        </div>
      </div>
      <ChartContainer
        config={comparisonChartConfig}
        className="mx-auto mt-2 h-[118px] w-full max-w-[180px]"
      >
        <PieChart>
          <ChartTooltip
            content={
              <ChartTooltipContent hideLabel nameKey="key" indicator="dot" />
            }
          />
          <Pie
            data={data}
            dataKey="value"
            nameKey="key"
            innerRadius={28}
            outerRadius={48}
            paddingAngle={2}
          >
            {data.map((item) => (
              <Cell key={item.key} fill={item.fill} />
            ))}
          </Pie>
        </PieChart>
      </ChartContainer>
      <div className="mt-2 grid gap-1">
        {data.map((item) => (
          <div
            key={`${title}-${item.key}`}
            className="text-muted-foreground flex items-center justify-between gap-2 text-xs"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: item.fill }}
              />
              <span className="truncate">{item.name}</span>
            </span>
            <span className="tabular-nums">{Math.round(item.value)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SourceComparisonTooltip({
  runs,
  promptId,
  promptTitle,
  onOpenSourcesForPrompt,
}: {
  runs: ProviderRun[];
  promptId: Id<"prompts">;
  promptTitle: string;
  onOpenSourcesForPrompt?: (
    promptId: Id<"prompts">,
    promptExcerpt: string
  ) => void;
}) {
  const rows = runs.map((run) => ({
    providerName: run.providerName,
    domains: Array.from(
      new Set(run.citations.map(getCitationDomain).filter(Boolean))
    ),
  }));
  const totalDomains = new Set(rows.flatMap((row) => row.domains));

  return (
    <div className="flex max-w-80 flex-col gap-2">
      <p>Source domains captured by each provider in this prompt run group.</p>
      {totalDomains.size ? (
        <div className="flex flex-col gap-1.5">
          {rows.map((row) => (
            <div key={row.providerName} className="text-xs">
              <span className="font-medium">{row.providerName}: </span>
              <span className="text-muted-foreground">
                {row.domains.length ? row.domains.join(", ") : "No sources"}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-xs">
          No provider captured sources for this prompt yet.
        </p>
      )}
      {onOpenSourcesForPrompt ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-1 w-fit"
          onClick={() => onOpenSourcesForPrompt(promptId, promptTitle)}
        >
          Open filtered sources
          <ArrowUpRightIcon data-icon="inline-end" />
        </Button>
      ) : null}
    </div>
  );
}

function RunContextDetails({ run }: { run: ProviderRun }) {
  return (
    <details className="rounded-md border p-3 text-xs">
      <summary className="text-muted-foreground cursor-pointer font-medium">
        Engine, session, and evidence
      </summary>
      <div className="text-muted-foreground mt-3 grid gap-2">
        <DetailRow
          label="Engine"
          value={formatBrowserEngine(resolveBrowserEngine(run))}
        />
        <DetailRow
          label="Session"
          value={run.sessionMode ? formatSessionMode(run.sessionMode) : "-"}
        />
        <DetailRow label="Provider URL" value={run.providerUrl} />
        <DetailRow label="Evidence path" value={run.evidencePath} />
        <DetailRow label="Runner" value={run.runner} />
      </div>
    </details>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string | undefined;
}) {
  if (!value) {
    return null;
  }

  return (
    <div className="grid gap-1 sm:grid-cols-[120px_minmax(0,1fr)]">
      <span className="text-foreground font-medium">{label}</span>
      <span className="break-all">{value}</span>
    </div>
  );
}

function buildComparisonMetrics(runs: ProviderRun[]) {
  const responseTexts = runs
    .map((run) => run.responseText?.trim() || run.responseSummary?.trim() || "")
    .filter(Boolean);
  const responseSimilarity =
    responseTexts.length > 1 ? getAverageSimilarity(responseTexts) : undefined;
  const similar = responseSimilarity ?? 0;
  const different = responseSimilarity === undefined ? 0 : 100 - similar;

  const sourceCounts = new Map<string, number>();
  for (const run of runs) {
    const runDomains = new Set(
      run.citations.map(getCitationDomain).filter(Boolean)
    );
    for (const domain of runDomains) {
      sourceCounts.set(domain, (sourceCounts.get(domain) ?? 0) + 1);
    }
  }

  const totalSourceDomains = sourceCounts.size;
  const sharedSourceDomains = Array.from(sourceCounts.values()).filter(
    (count) => count > 1
  ).length;
  const uniqueSourceDomains = Math.max(
    0,
    totalSourceDomains - sharedSourceDomains
  );
  const sharedPercent = totalSourceDomains
    ? Math.round((sharedSourceDomains / totalSourceDomains) * 100)
    : 0;
  const uniquePercent = totalSourceDomains ? 100 - sharedPercent : 0;

  return {
    responseSimilarity,
    totalSourceDomains,
    sharedSourceDomains,
    uniqueSourceDomains,
    responseSlices:
      responseSimilarity === undefined
        ? [
            {
              key: "none" as const,
              name: "No comparison",
              value: 100,
              fill: "var(--muted)",
            },
          ]
        : [
            {
              key: "similar" as const,
              name: "Similar",
              value: similar,
              fill: "var(--color-similar)",
            },
            {
              key: "different" as const,
              name: "Different",
              value: different,
              fill: "var(--color-different)",
            },
          ],
    sourceSlices: totalSourceDomains
      ? [
          {
            key: "shared" as const,
            name: "Shared",
            value: sharedPercent,
            fill: "var(--color-shared)",
          },
          {
            key: "unique" as const,
            name: "Provider-specific",
            value: uniquePercent,
            fill: "var(--color-unique)",
          },
        ]
      : [
          {
            key: "none" as const,
            name: "No sources",
            value: 100,
            fill: "var(--muted)",
          },
        ],
  };
}

function getAverageSimilarity(texts: string[]) {
  const tokenSets = texts.map(tokenize);
  const scores: number[] = [];

  for (let index = 0; index < tokenSets.length; index += 1) {
    for (
      let nextIndex = index + 1;
      nextIndex < tokenSets.length;
      nextIndex += 1
    ) {
      scores.push(getJaccardSimilarity(tokenSets[index], tokenSets[nextIndex]));
    }
  }

  if (!scores.length) {
    return 0;
  }

  return Math.round(
    (scores.reduce((sum, score) => sum + score, 0) / scores.length) * 100
  );
}

function tokenize(value: string) {
  return new Set(value.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []);
}

function getJaccardSimilarity(first: Set<string>, second: Set<string>) {
  if (first.size === 0 && second.size === 0) {
    return 1;
  }
  if (first.size === 0 || second.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const token of first) {
    if (second.has(token)) {
      intersection += 1;
    }
  }

  const union = new Set([...first, ...second]).size;
  return union ? intersection / union : 0;
}

function getCitationDomain(citation: { domain: string; url: string }) {
  const domain = citation.domain.trim();
  if (domain) {
    return domain.replace(/^www\./, "").toLowerCase();
  }

  try {
    return new URL(citation.url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return citation.url;
  }
}

function statusTone(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized === "success") {
    return "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  }
  if (normalized === "blocked") {
    return "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  }
  if (normalized === "failed") {
    return "border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-300";
  }
  if (normalized === "running") {
    return "border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-300";
  }
  return "";
}

function getRuntimeMs(run: {
  latencyMs?: number;
  startedAt: number;
  finishedAt?: number;
}) {
  if (typeof run.latencyMs === "number") {
    return run.latencyMs;
  }
  if (typeof run.finishedAt === "number") {
    return Math.max(0, run.finishedAt - run.startedAt);
  }
  return undefined;
}

function formatGroupRuntime(detail: RunGroupDetail) {
  const maxRuntime = Math.max(
    ...detail.runs
      .map((run) => getRuntimeMs(run))
      .filter((value): value is number => typeof value === "number")
  );
  return Number.isFinite(maxRuntime) ? formatDuration(maxRuntime) : "-";
}

function formatRuntime(run: {
  latencyMs?: number;
  startedAt: number;
  finishedAt?: number;
}) {
  return formatDuration(getRuntimeMs(run));
}

function formatDuration(value: number | undefined) {
  if (value === undefined) {
    return "-";
  }
  if (value < 1000) {
    return `${Math.round(value)}ms`;
  }
  const seconds = value / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds % 60);
  return `${minutes}m ${remainder}s`;
}

function resolveBrowserEngine(run: {
  browserEngine?: BrowserEngine;
  runner?: string;
}): BrowserEngine | undefined {
  if (run.browserEngine) {
    return run.browserEngine;
  }
  if (run.runner?.includes("camoufox")) {
    return "camoufox";
  }
  if (run.runner?.includes("nodriver")) {
    return "nodriver";
  }
  if (run.runner?.includes("playwright")) {
    return "playwright";
  }
  return undefined;
}

function formatBrowserEngine(engine: BrowserEngine | undefined) {
  if (engine === "camoufox") {
    return "Camoufox";
  }
  if (engine === "nodriver") {
    return "Nodriver";
  }
  if (engine === "playwright") {
    return "Playwright";
  }
  return "Unknown";
}

function formatSessionMode(value: "guest" | "stored") {
  return value === "stored" ? "Stored session" : "Guest session";
}

function titleCase(value: string) {
  return value
    .split("_")
    .map((item) => item.charAt(0).toUpperCase() + item.slice(1).toLowerCase())
    .join(" ");
}
