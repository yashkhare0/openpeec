import { useEffect, useRef } from "react";
import {
  ArrowUpRightIcon,
  RefreshCcwIcon,
  Trash2Icon,
  XCircleIcon,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Id } from "../../../convex/_generated/dataModel";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { InlineEmpty } from "./components/EmptyState";
import {
  DashboardCardSkeleton,
  DashboardListSkeleton,
} from "./components/LoadingState";

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

function formatDuration(
  startedAt: number,
  finishedAt: number | undefined,
  latencyMs: number | undefined
): string {
  if (latencyMs !== undefined) return `${(latencyMs / 1000).toFixed(1)}s`;
  if (finishedAt !== undefined)
    return `${((finishedAt - startedAt) / 1000).toFixed(1)}s`;
  return "-";
}

function titleCase(value: string): string {
  return value
    .split("_")
    .map((item) => item.charAt(0).toUpperCase() + item.slice(1).toLowerCase())
    .join(" ");
}

function domainFromUrl(url: string | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function parseOutputPayload(value: string | undefined) {
  if (!value) return null;
  try {
    return JSON.parse(value) as {
      finalUrl?: string;
      artifacts?: {
        runDir?: string;
        screenshot?: string;
        responseScreenshot?: string | null;
        video?: string | null;
        trace?: string;
        pageHtml?: string;
        responseHtml?: string;
        sources?: string;
        network?: string;
        console?: string;
      };
    };
  } catch {
    return null;
  }
}

function artifactUrlFromPath(
  filePath: string | null | undefined
): string | null {
  if (!filePath) return null;
  const normalized = filePath.replace(/\\/g, "/");
  const marker = "runner/artifacts/";
  const markerIndex = normalized.toLowerCase().indexOf(marker);
  if (markerIndex === -1) return null;
  const relative = normalized.slice(markerIndex + marker.length);
  if (!relative) return null;
  const encoded = relative
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `/runner-artifacts/${encoded}`;
}

// GEO-system status pill — same palette as OverviewPage / RunsPage so an
// operator's eye reads the same color story everywhere.
function statusPillClass(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized === "success") {
    return "border-positive/40 text-positive bg-positive/10";
  }
  if (normalized === "blocked") {
    return "border-negative/40 text-negative bg-negative/10";
  }
  if (normalized === "failed") {
    return "border-negative/40 text-negative bg-negative/10";
  }
  if (normalized === "running") {
    return "border-primary/40 text-primary bg-primary/10";
  }
  if (normalized === "queued") {
    return "border-highlight/50 text-highlight-foreground bg-highlight/15";
  }
  return "border-border/60 text-muted-foreground bg-muted/30";
}

function formatSessionMode(value: "guest" | "stored" | undefined): string {
  if (value === "stored") {
    return "Stored session";
  }
  if (value === "guest") {
    return "Guest session";
  }
  return "Session unknown";
}

type EvidenceImage = {
  label: string;
  url: string;
};

function buildEvidenceImages({
  evidencePath,
  pageScreenshotPath,
  responseScreenshotPath,
}: {
  evidencePath: string | undefined;
  pageScreenshotPath: string | undefined;
  responseScreenshotPath: string | undefined;
}): EvidenceImage[] {
  const candidates = [
    {
      label: "Response screenshot",
      filePath: responseScreenshotPath,
    },
    {
      label: "Page screenshot",
      filePath: pageScreenshotPath,
    },
    {
      label: "Evidence screenshot",
      filePath: evidencePath,
    },
  ];

  const seen = new Set<string>();
  return candidates.flatMap((candidate) => {
    const url = artifactUrlFromPath(candidate.filePath);
    if (!candidate.filePath || !url || seen.has(url)) {
      return [];
    }

    seen.add(url);
    return [
      {
        label: candidate.label,
        url,
      },
    ];
  });
}

export function ResponseDetailPage({
  loading = false,
  runDetail,
  onOpenPrompt,
  onRetryRun,
  onCancelRun,
  onDeleteRun,
}: {
  loading?: boolean;
  runDetail:
    | {
        run: {
          _id: Id<"promptRuns">;
          promptId?: Id<"prompts">;
          status: string;
          startedAt: number;
          finishedAt?: number;
          latencyMs?: number;
          providerSlug: string;
          providerName: string;
          providerUrl?: string;
          channelName?: string;
          sessionMode?: "guest" | "stored";
          promptExcerpt: string;
          responseText?: string;
          responseSummary?: string;
          sourceCount?: number;
          citationQualityScore?: number;
          deeplinkUsed?: string;
          evidencePath?: string;
          output?: string;
          warnings?: string[];
        };
        prompt?: {
          excerpt: string;
          promptText: string;
        } | null;
        mentions?: Array<{
          entityId?: Id<"trackedEntities">;
          name: string;
          slug: string;
          kind: string;
          mentionCount: number;
          citationCount: number;
          ownedCitationCount: number;
          matchedTerms: string[];
        }>;
        citations: Array<{
          domain: string;
          url: string;
          title?: string;
          snippet?: string;
          type: string;
          position: number;
          qualityScore?: number;
          isOwned?: boolean;
          trackedEntity?: {
            name: string;
            slug: string;
          } | null;
        }>;
      }
    | undefined;
  onOpenPrompt?: () => void;
  onRetryRun?: (runId: Id<"promptRuns">) => void | Promise<void>;
  onCancelRun?: (runId: Id<"promptRuns">) => void | Promise<void>;
  onDeleteRun?: (runId: Id<"promptRuns">) => void | Promise<void>;
}) {
  if (loading) {
    return (
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <div className="grid gap-4 px-4 lg:px-6 xl:grid-cols-[minmax(0,1.05fr)_380px]">
          <DashboardCardSkeleton
            titleWidth="w-40"
            descriptionWidth="w-56"
            contentClassName="space-y-4"
          >
            <div className="flex gap-2">
              <div className="bg-muted/50 h-6 w-20 rounded-full" />
              <div className="bg-muted/50 h-6 w-24 rounded-full" />
              <div className="bg-muted/50 h-6 w-20 rounded-full" />
            </div>
            <div className="space-y-3">
              <div className="bg-muted/40 h-24 rounded-xl" />
              <div className="bg-muted/40 h-28 rounded-xl" />
            </div>
            <DashboardCardSkeleton
              titleWidth="w-44"
              descriptionWidth="w-72"
              contentClassName="space-y-3"
            >
              <DashboardListSkeleton items={4} />
            </DashboardCardSkeleton>
          </DashboardCardSkeleton>

          <div className="flex flex-col gap-4">
            <DashboardCardSkeleton
              titleWidth="w-32"
              descriptionWidth="w-56"
              contentClassName="space-y-3"
            >
              <DashboardListSkeleton items={3} />
            </DashboardCardSkeleton>
            <DashboardCardSkeleton
              titleWidth="w-24"
              descriptionWidth="w-48"
              contentClassName="space-y-3"
            >
              <div className="bg-muted/40 aspect-[4/3] rounded-xl" />
            </DashboardCardSkeleton>
          </div>
        </div>
      </div>
    );
  }

  const outputPayload = parseOutputPayload(runDetail?.run.output);
  const pageScreenshotPath = outputPayload?.artifacts?.screenshot;
  const responseScreenshotPath =
    outputPayload?.artifacts?.responseScreenshot ?? undefined;
  const screenshotPath =
    runDetail?.run.evidencePath ?? responseScreenshotPath ?? pageScreenshotPath;

  if (!runDetail) {
    return (
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <div className="px-4 lg:px-6">
          <InlineEmpty text="No response detail available yet." />
        </div>
      </div>
    );
  }

  const runStatus = runDetail.run.status.toLowerCase();
  const isSuccessfulRun = runStatus === "success";
  const isRetryable = runStatus === "failed" || runStatus === "blocked";
  const isQueuedRun = runStatus === "queued";
  const isCancelable = runStatus === "queued" || runStatus === "running";
  const runSummaryLabel = isSuccessfulRun ? "Response Summary" : "Run Summary";
  const responseText =
    runDetail.run.responseText?.trim() || runDetail.run.responseSummary?.trim();
  const displayTitle = runDetail.prompt?.excerpt ?? runDetail.run.promptExcerpt;
  const promptText = runDetail.prompt?.promptText?.trim();
  const showPromptText = Boolean(
    promptText && promptText !== displayTitle.trim()
  );
  const evidenceImages = buildEvidenceImages({
    evidencePath: runDetail.run.evidencePath,
    pageScreenshotPath,
    responseScreenshotPath,
  });
  const hasRunActions =
    Boolean(onOpenPrompt) ||
    (isRetryable && Boolean(onRetryRun)) ||
    (isCancelable && Boolean(onCancelRun)) ||
    (isQueuedRun && Boolean(onDeleteRun));
  const noCitationMessage =
    runStatus === "blocked"
      ? "This run was blocked before ChatGPT produced a valid response, so no citations were recorded."
      : runStatus === "failed"
        ? "This run failed before a valid response could be analyzed, so no citations were recorded."
        : "No citations were captured for this response.";

  // Surface "did MY domain get cited?" prominently: count owned citations so
  // the masthead can highlight the GEO-relevant signal up top.
  const ownedCitationCount = runDetail.citations.filter(
    (citation) => citation.isOwned
  ).length;

  return (
    <div className="py-4 md:py-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 lg:px-6">
        <DetailHeader
          runStatus={runStatus}
          isRetryable={isRetryable}
          isQueuedRun={isQueuedRun}
          isCancelable={isCancelable}
          hasRunActions={hasRunActions}
          displayTitle={displayTitle}
          run={runDetail.run}
          onOpenPrompt={onOpenPrompt}
          onRetryRun={onRetryRun}
          onCancelRun={onCancelRun}
          onDeleteRun={onDeleteRun}
        />

        <DetailMetrics
          sourceCount={runDetail.run.sourceCount ?? 0}
          citationCount={runDetail.citations.length}
          ownedCount={ownedCitationCount}
          qualityScore={runDetail.run.citationQualityScore}
          runtime={formatDuration(
            runDetail.run.startedAt,
            runDetail.run.finishedAt,
            runDetail.run.latencyMs
          )}
        />

        {/*
          Side-by-side response + sources is the GEO X-ray view: text on the
          left, who got cited on the right, so the operator can cross-reference
          claims to citations without scrolling. Stacks below xl for narrow
          screens.
        */}
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-6">
            {responseText ? (
              <article className="rounded-xl border border-border/70 bg-card/60 p-5">
                <SectionLabel>{runSummaryLabel}</SectionLabel>
                <MarkdownContent content={responseText} />
              </article>
            ) : null}

            {showPromptText ? (
              <article className="rounded-xl border border-border/70 bg-card/40 p-5">
                <SectionLabel>Prompt</SectionLabel>
                <p className="mt-2 text-sm leading-6 text-foreground/90">
                  {promptText}
                </p>
              </article>
            ) : null}
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-end justify-between gap-3">
              <SectionLabel>Sources</SectionLabel>
              <p className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
                {ownedCitationCount} owned · {runDetail.citations.length} total
              </p>
            </div>
            {runDetail.citations.length > 0 ? (
              <ol className="flex flex-col divide-y divide-border/40 rounded-xl border border-border/70 bg-card/60">
                {runDetail.citations.map((citation, index) => (
                  <CitationRow
                    key={`${citation.url}-${index}`}
                    citation={citation}
                  />
                ))}
              </ol>
            ) : isSuccessfulRun ? (
              <p className="rounded-xl border border-border/60 bg-card/40 p-4 text-sm text-muted-foreground">
                {noCitationMessage}
              </p>
            ) : (
              <p className="rounded-xl border border-border/60 bg-card/40 p-4 text-sm text-muted-foreground">
                {noCitationMessage}
              </p>
            )}
          </div>
        </div>

        {runDetail.mentions?.length ? (
          <section className="space-y-3">
            <SectionLabel>Entity mentions</SectionLabel>
            <ul className="grid gap-2 sm:grid-cols-2">
              {runDetail.mentions.map((mention) => (
                <li
                  key={String(mention.entityId ?? mention.slug)}
                  className={cn(
                    "flex items-start justify-between gap-3 rounded-xl border border-border/70 bg-card/60 px-4 py-3",
                    mention.ownedCitationCount > 0 &&
                      "border-highlight/40 bg-highlight/[0.06]"
                  )}
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-foreground">
                      {mention.name}
                    </p>
                    <p className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground uppercase mt-0.5">
                      {titleCase(mention.kind)}
                    </p>
                    {mention.matchedTerms.length ? (
                      <p className="text-muted-foreground mt-1.5 text-xs">
                        Terms: {mention.matchedTerms.join(", ")}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-0.5 font-mono text-[10px] tabular-nums tracking-wider text-muted-foreground uppercase">
                    <span>{mention.mentionCount} mention{mention.mentionCount === 1 ? "" : "s"}</span>
                    <span>{mention.citationCount} citation{mention.citationCount === 1 ? "" : "s"}</span>
                    {mention.ownedCitationCount > 0 ? (
                      <span className="text-highlight-foreground/90">
                        {mention.ownedCitationCount} owned
                      </span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="space-y-3">
          <SectionLabel>Evidence</SectionLabel>
          <RunImageDetail images={evidenceImages} />

          <details className="rounded-xl border border-border/70 bg-card/40 px-4 py-3 text-xs">
            <summary className="cursor-pointer font-mono text-[10px] tracking-[0.24em] text-muted-foreground uppercase">
              Technical artifacts
            </summary>
            <div className="text-muted-foreground mt-3 flex flex-col gap-2">
              <DetailValueRow
                label="Provider URL"
                value={runDetail.run.providerUrl}
              />
              <DetailValueRow
                label="Deep link"
                value={runDetail.run.deeplinkUsed}
              />
              <DetailValueRow
                label="Final URL"
                value={outputPayload?.finalUrl}
              />
              <DetailValueRow
                label="Session"
                value={formatSessionMode(runDetail.run.sessionMode)}
              />
              <DetailValueRow
                label="Evidence screenshot"
                value={screenshotPath}
              />
              {responseScreenshotPath &&
              responseScreenshotPath !== screenshotPath ? (
                <DetailValueRow
                  label="Response screenshot"
                  value={responseScreenshotPath}
                />
              ) : null}
              {pageScreenshotPath && pageScreenshotPath !== screenshotPath ? (
                <DetailValueRow
                  label="Page screenshot"
                  value={pageScreenshotPath}
                />
              ) : null}
              <DetailValueRow
                label="Video"
                value={outputPayload?.artifacts?.video ?? undefined}
              />
              <DetailValueRow
                label="Trace"
                value={outputPayload?.artifacts?.trace}
              />
              <DetailValueRow
                label="Page HTML"
                value={outputPayload?.artifacts?.pageHtml}
              />
              <DetailValueRow
                label="Response HTML"
                value={outputPayload?.artifacts?.responseHtml}
              />
              <DetailValueRow
                label="Sources JSON"
                value={outputPayload?.artifacts?.sources}
              />
              <DetailValueRow
                label="Network JSON"
                value={outputPayload?.artifacts?.network}
              />
              <DetailValueRow
                label="Console JSON"
                value={outputPayload?.artifacts?.console}
              />
            </div>
          </details>

          {runDetail.run.warnings?.length ? (
            <details className="rounded-xl border border-negative/30 bg-negative/[0.04] px-4 py-3 text-xs">
              <summary className="cursor-pointer font-mono text-[10px] tracking-[0.24em] text-negative uppercase">
                Runner notes · {runDetail.run.warnings.length}
              </summary>
              <ul className="text-foreground/80 mt-3 flex flex-col gap-2 leading-5">
                {runDetail.run.warnings.map((warning, index) => (
                  <li key={`${warning}-${index}`}>{warning}</li>
                ))}
              </ul>
            </details>
          ) : null}
        </section>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Detail-page subcomponents — header, metric strip, citation rows
// -----------------------------------------------------------------------------

function DetailHeader({
  runStatus,
  isRetryable,
  isQueuedRun,
  isCancelable,
  hasRunActions,
  displayTitle,
  run,
  onOpenPrompt,
  onRetryRun,
  onCancelRun,
  onDeleteRun,
}: {
  runStatus: string;
  isRetryable: boolean;
  isQueuedRun: boolean;
  isCancelable: boolean;
  hasRunActions: boolean;
  displayTitle: string;
  run: {
    _id: Id<"promptRuns">;
    providerName: string;
    channelName?: string;
    sessionMode?: "guest" | "stored";
    startedAt: number;
    status: string;
  };
  onOpenPrompt?: () => void;
  onRetryRun?: (runId: Id<"promptRuns">) => void | Promise<void>;
  onCancelRun?: (runId: Id<"promptRuns">) => void | Promise<void>;
  onDeleteRun?: (runId: Id<"promptRuns">) => void | Promise<void>;
}) {
  return (
    <header className="flex flex-col gap-4 border-b border-border/60 pb-5 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0 space-y-2.5">
        <p className="font-mono text-[10px] tracking-[0.32em] text-muted-foreground uppercase">
          GEO Pulse / Run · {run.providerName}
          {run.channelName ? ` · ${run.channelName}` : ""}
        </p>
        <h1 className="font-display text-3xl font-extrabold leading-[1.05] tracking-[-0.022em] text-foreground sm:text-[2.25rem]">
          {displayTitle}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em]",
              statusPillClass(runStatus)
            )}
          >
            {titleCase(run.status)}
          </span>
          <span className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
            {formatFreshness(run.startedAt)} · {formatSessionMode(run.sessionMode)}
          </span>
        </div>
      </div>
      {hasRunActions ? (
        <div className="flex shrink-0 flex-wrap gap-2">
          {onOpenPrompt ? (
            <Button variant="outline" size="sm" onClick={onOpenPrompt}>
              <ArrowUpRightIcon data-icon="inline-start" />
              Open prompt
            </Button>
          ) : null}
          {isRetryable && onRetryRun ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                void onRetryRun(run._id);
              }}
            >
              <RefreshCcwIcon data-icon="inline-start" />
              Retry run
            </Button>
          ) : null}
          {isCancelable && onCancelRun ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                void onCancelRun(run._id);
              }}
            >
              <XCircleIcon data-icon="inline-start" />
              {isQueuedRun ? "Cancel queued run" : "Cancel run"}
            </Button>
          ) : null}
          {isQueuedRun && onDeleteRun ? (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                void onDeleteRun(run._id);
              }}
            >
              <Trash2Icon data-icon="inline-start" />
              Delete run
            </Button>
          ) : null}
        </div>
      ) : null}
    </header>
  );
}

function DetailMetrics({
  sourceCount,
  citationCount,
  ownedCount,
  qualityScore,
  runtime,
}: {
  sourceCount: number;
  citationCount: number;
  ownedCount: number;
  qualityScore: number | undefined;
  runtime: string;
}) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <DetailMetric label="Sources" value={sourceCount.toString()} />
      <DetailMetric label="Citations" value={citationCount.toString()} />
      <DetailMetric
        label="Owned"
        value={ownedCount.toString()}
        tone={ownedCount > 0 ? "highlight" : "neutral"}
      />
      <DetailMetric
        label="Quality"
        value={formatScore(qualityScore)}
      />
      <DetailMetric label="Runtime" value={runtime} />
    </dl>
  );
}

function DetailMetric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "highlight";
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-xl border bg-card/60 px-4 py-3",
        tone === "highlight"
          ? "border-highlight/40 bg-highlight/[0.06]"
          : "border-border/70"
      )}
    >
      <p className="font-mono text-[10px] tracking-[0.28em] text-muted-foreground uppercase">
        {label}
      </p>
      <p
        className={cn(
          "font-display text-2xl font-extrabold tabular-nums tracking-tight",
          tone === "highlight" ? "text-highlight-foreground" : "text-foreground"
        )}
      >
        {value}
      </p>
    </div>
  );
}

function CitationRow({
  citation,
}: {
  citation: {
    domain: string;
    url: string;
    title?: string;
    snippet?: string;
    type: string;
    position: number;
    qualityScore?: number;
    isOwned?: boolean;
    trackedEntity?: {
      name: string;
      slug: string;
    } | null;
  };
}) {
  const domain = domainFromUrl(citation.url) || citation.domain;
  return (
    <li className={cn(citation.isOwned && "bg-highlight/[0.08]")}>
      <Tooltip>
        <TooltipTrigger asChild>
          <a
            href={citation.url}
            target="_blank"
            rel="noreferrer"
            aria-label={`Open source ${citation.title || domain} from ${domain}`}
            className="group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span
              className={cn(
                "font-mono text-[11px] tabular-nums tracking-wider mt-0.5 shrink-0 w-6",
                citation.isOwned
                  ? "text-highlight-foreground"
                  : "text-muted-foreground"
              )}
            >
              {String(citation.position).padStart(2, "0")}
            </span>
            <span className="min-w-0 flex-1 space-y-1">
              <span className="block truncate text-sm font-semibold text-foreground">
                {citation.title || domain}
              </span>
              <span className="block truncate font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
                {domain}
                <span className="mx-1.5 text-muted-foreground/40">·</span>
                {citation.type}
                {citation.qualityScore !== undefined ? (
                  <>
                    <span className="mx-1.5 text-muted-foreground/40">·</span>
                    Q {formatScore(citation.qualityScore)}
                  </>
                ) : null}
                {citation.isOwned ? (
                  <>
                    <span className="mx-1.5 text-highlight/60">·</span>
                    <span className="text-highlight-foreground">Owned</span>
                  </>
                ) : null}
                {citation.trackedEntity ? (
                  <>
                    <span className="mx-1.5 text-muted-foreground/40">·</span>
                    {citation.trackedEntity.name}
                  </>
                ) : null}
              </span>
              {citation.snippet ? (
                <span className="line-clamp-2 text-xs text-muted-foreground leading-5">
                  {citation.snippet}
                </span>
              ) : null}
            </span>
            <ArrowUpRightIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/70 transition-colors group-hover:text-foreground" />
          </a>
        </TooltipTrigger>
        <TooltipContent className="max-w-sm">
          <CitationTooltipContent citation={citation} />
        </TooltipContent>
      </Tooltip>
    </li>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <h2 className="font-mono text-[11px] tracking-[0.32em] text-muted-foreground uppercase">
      {children}
    </h2>
  );
}

function CitationTooltipContent({
  citation,
}: {
  citation: {
    domain: string;
    url: string;
    title?: string;
    snippet?: string;
    type: string;
    position: number;
    qualityScore?: number;
    isOwned?: boolean;
    trackedEntity?: {
      name: string;
      slug: string;
    } | null;
  };
}) {
  return (
    <div className="flex flex-col gap-1 text-xs">
      <TooltipLine label="URL" value={citation.url} />
      <TooltipLine label="Position" value={`#${citation.position}`} />
      <TooltipLine label="Type" value={titleCase(citation.type)} />
      {citation.qualityScore !== undefined ? (
        <TooltipLine
          label="Quality"
          value={formatScore(citation.qualityScore)}
        />
      ) : null}
      {citation.isOwned ? (
        <TooltipLine label="Ownership" value="Owned" />
      ) : null}
      <TooltipLine
        label="Tracked entity"
        value={citation.trackedEntity?.name}
      />
      <TooltipLine label="Snippet" value={citation.snippet} />
    </div>
  );
}

function TooltipLine({
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
    <p className="break-all">
      <span className="opacity-70">{label}: </span>
      {value}
    </p>
  );
}

function MarkdownContent({ content }: { content: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof scrollRef.current?.scrollTo === "function") {
      scrollRef.current.scrollTo({ top: 0 });
    }
  }, [content]);

  return (
    <div ref={scrollRef} className="mt-2 max-h-[28rem] overflow-y-auto pr-2">
      <div className="text-foreground/90 [&_blockquote]:bg-muted/20 [&_code]:bg-muted [&_pre]:bg-muted flex flex-col gap-3 text-sm leading-6 [&_a]:font-medium [&_a]:underline [&_a]:underline-offset-2 [&_blockquote]:border [&_blockquote]:px-3 [&_blockquote]:py-2 [&_code]:rounded-md [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs [&_li]:pl-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_strong]:font-semibold [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:px-2 [&_th]:py-1 [&_ul]:list-disc [&_ul]:pl-5">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </div>
    </div>
  );
}

function RunImageDetail({ images }: { images: EvidenceImage[] }) {
  if (!images.length) {
    return <InlineEmpty text="Screenshot preview unavailable for this run." />;
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {images.map((image) => (
        <a
          key={image.url}
          href={image.url}
          target="_blank"
          rel="noreferrer"
          className="group overflow-hidden rounded-xl border border-border/70 bg-card/60 text-sm transition-colors hover:border-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex items-start justify-between gap-3 px-4 py-2.5">
            <span className="min-w-0">
              <span className="block font-mono text-[10px] tracking-[0.24em] text-muted-foreground uppercase">
                {image.label}
              </span>
            </span>
            <ArrowUpRightIcon className="text-muted-foreground mt-0.5 size-3.5 shrink-0 transition-colors group-hover:text-foreground" />
          </span>
          <span className="bg-muted/20 block border-t border-border/40 p-2">
            <img
              src={image.url}
              alt={image.label}
              className="h-36 w-full object-contain"
              loading="lazy"
            />
          </span>
        </a>
      ))}
    </div>
  );
}

function DetailValueRow({
  label,
  value,
}: {
  label: string;
  value: string | undefined;
}) {
  if (!value) {
    return null;
  }

  const href = artifactUrlFromPath(value) ?? (isWebUrl(value) ? value : null);
  return (
    <p className="break-all">
      {label}:{" "}
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="text-foreground underline underline-offset-2"
        >
          Open
        </a>
      ) : (
        value
      )}
    </p>
  );
}

function isWebUrl(value: string) {
  return value.startsWith("http://") || value.startsWith("https://");
}
