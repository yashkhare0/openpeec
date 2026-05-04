import { useEffect, useRef } from "react";
import { ArrowUpRightIcon, RefreshCcwIcon, XCircleIcon } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Id } from "../../../convex/_generated/dataModel";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { clickableTableRowClassName } from "./components/InfoTooltip";
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
    (isCancelable && Boolean(onCancelRun));
  const noCitationMessage =
    runStatus === "blocked"
      ? "This run was blocked before ChatGPT produced a valid response, so no citations were recorded."
      : runStatus === "failed"
        ? "This run failed before a valid response could be analyzed, so no citations were recorded."
        : "No citations were captured for this response.";

  return (
    <div className="py-4 md:py-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 lg:px-6">
        <header className="flex flex-col gap-4 border-b pb-5 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={statusTone(runStatus)}>
                {titleCase(runDetail.run.status)}
              </Badge>
              <span className="text-muted-foreground text-sm">
                {runDetail.run.providerName}
                {runDetail.run.channelName
                  ? ` - ${runDetail.run.channelName}`
                  : ""}
              </span>
            </div>
            <div>
              <h1 className="text-2xl leading-tight font-semibold tracking-normal">
                {displayTitle}
              </h1>
              <p className="text-muted-foreground mt-2 text-sm">
                {formatFreshness(runDetail.run.startedAt)} -{" "}
                {formatSessionMode(runDetail.run.sessionMode)}
              </p>
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
                    void onRetryRun(runDetail.run._id);
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
                    void onCancelRun(runDetail.run._id);
                  }}
                >
                  <XCircleIcon data-icon="inline-start" />
                  Cancel run
                </Button>
              ) : null}
            </div>
          ) : null}
        </header>

        <dl className="grid gap-x-6 gap-y-3 border-y py-4 sm:grid-cols-4">
          <Metric label="Sources" value={runDetail.run.sourceCount ?? 0} />
          <Metric label="Citations" value={runDetail.citations.length} />
          <Metric
            label="Citation score"
            value={formatScore(runDetail.run.citationQualityScore)}
          />
          <Metric
            label="Runtime"
            value={formatDuration(
              runDetail.run.startedAt,
              runDetail.run.finishedAt,
              runDetail.run.latencyMs
            )}
          />
        </dl>

        {showPromptText ? (
          <section className="rounded-lg border p-4">
            <SectionLabel>Prompt</SectionLabel>
            <p className="mt-2 text-sm leading-6">{promptText}</p>
          </section>
        ) : null}

        {responseText ? (
          <section className="rounded-lg border p-4">
            <SectionLabel>{runSummaryLabel}</SectionLabel>
            <MarkdownContent content={responseText} />
          </section>
        ) : null}

        {runDetail.citations.length > 0 ? (
          <section className="flex flex-col gap-3">
            <h2 className="text-base font-semibold">Sources</h2>
            <div className="divide-border divide-y rounded-lg border">
              {runDetail.citations.map((citation, index) => (
                <Tooltip key={`${citation.url}-${index}`}>
                  <TooltipTrigger asChild>
                    <a
                      href={citation.url}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Open source ${citation.title || citation.domain} from ${
                        domainFromUrl(citation.url) || citation.domain
                      }`}
                      className={cn(
                        "flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between",
                        clickableTableRowClassName
                      )}
                    >
                      <span className="flex min-w-0 flex-col gap-2">
                        <span className="flex min-w-0 items-center gap-2">
                          <Badge variant="outline">#{citation.position}</Badge>
                          <span className="truncate text-sm font-medium">
                            {citation.title || citation.domain}
                          </span>
                        </span>
                        <span className="text-muted-foreground block truncate text-xs">
                          {domainFromUrl(citation.url) || citation.domain}
                        </span>
                        <span className="flex flex-wrap gap-1.5">
                          <Badge variant="secondary">
                            {titleCase(citation.type)}
                          </Badge>
                          {citation.qualityScore !== undefined ? (
                            <Badge variant="outline">
                              Quality {formatScore(citation.qualityScore)}
                            </Badge>
                          ) : null}
                          {citation.isOwned ? (
                            <Badge variant="outline">Owned</Badge>
                          ) : null}
                          {citation.trackedEntity ? (
                            <Badge variant="outline">
                              {citation.trackedEntity.name}
                            </Badge>
                          ) : null}
                        </span>
                        {citation.snippet ? (
                          <span className="text-muted-foreground block text-sm leading-6">
                            {citation.snippet}
                          </span>
                        ) : null}
                      </span>
                      <span className="text-muted-foreground inline-flex shrink-0 items-center gap-1 text-xs font-medium">
                        Open
                        <ArrowUpRightIcon className="size-3.5" />
                      </span>
                    </a>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    <CitationTooltipContent citation={citation} />
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          </section>
        ) : isSuccessfulRun ? (
          <p className="text-muted-foreground text-sm">{noCitationMessage}</p>
        ) : null}

        {runDetail.mentions?.length ? (
          <section className="flex flex-col gap-3">
            <h2 className="text-base font-semibold">Entity Mentions</h2>
            <div className="divide-border divide-y rounded-lg border">
              {runDetail.mentions.map((mention) => (
                <div
                  key={String(mention.entityId ?? mention.slug)}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium">{mention.name}</p>
                    <p className="text-muted-foreground text-xs">
                      {titleCase(mention.kind)}
                    </p>
                    {mention.matchedTerms.length ? (
                      <p className="text-muted-foreground mt-2 text-xs">
                        Terms: {mention.matchedTerms.join(", ")}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="outline">
                      {mention.mentionCount} mentions
                    </Badge>
                    <Badge variant="outline">
                      {mention.citationCount} citations
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="flex flex-col gap-3">
          <h2 className="text-base font-semibold">Evidence</h2>

          <RunImageDetail images={evidenceImages} />

          <details className="rounded-lg border p-3 text-xs">
            <summary className="text-muted-foreground cursor-pointer font-medium">
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
            <details className="rounded-lg border p-3 text-xs">
              <summary className="text-muted-foreground cursor-pointer font-medium">
                Runner notes
              </summary>
              <div className="text-muted-foreground mt-2 flex flex-col gap-2">
                {runDetail.run.warnings.map((warning, index) => (
                  <p key={`${warning}-${index}`}>{warning}</p>
                ))}
              </div>
            </details>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="text-muted-foreground text-[11px] font-medium tracking-[0.16em] uppercase">
      {children}
    </p>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-1 truncate text-sm font-medium tabular-nums">
        {value}
      </dd>
    </div>
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
          className={cn(
            "overflow-hidden rounded-lg border text-sm",
            clickableTableRowClassName
          )}
        >
          <span className="flex items-start justify-between gap-3 p-3">
            <span className="min-w-0">
              <span className="block font-medium">{image.label}</span>
            </span>
            <ArrowUpRightIcon className="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
          </span>
          <span className="bg-muted/20 block border-t p-2">
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
