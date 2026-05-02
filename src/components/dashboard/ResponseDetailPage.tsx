import { ArrowUpRightIcon } from "lucide-react";
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

function artifactUrlFromPath(filePath: string | undefined): string | null {
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

const typeTone: Record<string, string> = {
  ugc: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300",
  editorial: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  corporate:
    "bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-300",
  docs: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300",
  social: "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-300",
  other: "bg-muted text-muted-foreground",
};

export function ResponseDetailPage({
  loading = false,
  runDetail,
  onBack,
  backLabel = "Back to prompt",
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
  onBack: () => void;
  backLabel?: string;
  onOpenPrompt?: () => void;
  onRetryRun?: (runId: Id<"promptRuns">) => void | Promise<void>;
  onCancelRun?: (runId: Id<"promptRuns">) => void | Promise<void>;
}) {
  if (loading) {
    return (
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <div className="flex items-center gap-2 px-4 lg:px-6">
          <Button variant="outline" size="sm" onClick={onBack}>
            {backLabel}
          </Button>
        </div>

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
  const screenshotUrl = artifactUrlFromPath(screenshotPath);

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
  const noCitationMessage =
    runStatus === "blocked"
      ? "This run was blocked before ChatGPT produced a valid response, so no citations were recorded."
      : runStatus === "failed"
        ? "This run failed before a valid response could be analyzed, so no citations were recorded."
        : "No citations were captured for this response.";

  return (
    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      <div className="flex items-center gap-2 px-4 lg:px-6">
        <Button variant="outline" size="sm" onClick={onBack}>
          {backLabel}
        </Button>
        {onOpenPrompt ? (
          <Button variant="ghost" size="sm" onClick={onOpenPrompt}>
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
            Cancel run
          </Button>
        ) : null}
      </div>

      <div className="grid gap-4 px-4 lg:px-6 xl:grid-cols-[minmax(0,1.05fr)_380px]">
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>
                {runDetail.prompt?.excerpt ?? runDetail.run.promptExcerpt}
              </CardTitle>
              <CardDescription>
                {runDetail.run.providerName}
                {runDetail.run.channelName
                  ? ` | ${runDetail.run.channelName}`
                  : ""}{" "}
                | {titleCase(runDetail.run.status)} |{" "}
                {formatFreshness(runDetail.run.startedAt)}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {isSuccessfulRun ? (
                  <Badge variant="secondary">
                    {runDetail.run.sourceCount ?? runDetail.citations.length}{" "}
                    sources
                  </Badge>
                ) : (
                  <Badge variant="secondary">
                    {titleCase(runDetail.run.status)}
                  </Badge>
                )}
                {runDetail.run.citationQualityScore !== undefined ? (
                  <Badge variant="outline">
                    Citation {formatScore(runDetail.run.citationQualityScore)}
                  </Badge>
                ) : null}
                <Badge variant="outline">
                  Runtime{" "}
                  {formatDuration(
                    runDetail.run.startedAt,
                    runDetail.run.finishedAt,
                    runDetail.run.latencyMs
                  )}
                </Badge>
                {runDetail.run.sessionMode ? (
                  <Badge variant="outline">
                    {runDetail.run.sessionMode === "stored"
                      ? "Local profile"
                      : "Ephemeral"}
                  </Badge>
                ) : null}
              </div>

              {runDetail.prompt?.promptText ? (
                <section className="bg-muted/20 rounded-xl border p-4">
                  <p className="text-muted-foreground text-[11px] font-medium tracking-[0.16em] uppercase">
                    Prompt
                  </p>
                  <p className="text-foreground/90 mt-2 text-sm leading-6">
                    {runDetail.prompt.promptText}
                  </p>
                </section>
              ) : null}

              {runDetail.run.responseSummary ? (
                <section className="bg-muted/20 rounded-xl border p-4">
                  <p className="text-muted-foreground text-[11px] font-medium tracking-[0.16em] uppercase">
                    {runSummaryLabel}
                  </p>
                  <p className="text-foreground/90 mt-2 text-sm leading-6">
                    {runDetail.run.responseSummary}
                  </p>
                </section>
              ) : null}

              {runDetail.citations.length === 0 ? (
                <InlineEmpty text={noCitationMessage} />
              ) : (
                <Card className="border-dashed shadow-none">
                  <CardHeader>
                    <CardTitle className="text-base">
                      Sources Used in This Response
                    </CardTitle>
                    <CardDescription>
                      These are the actual sources cited inside the captured
                      answer.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {runDetail.citations.map((citation, index) => (
                      <div
                        key={`${citation.url}-${index}`}
                        className="rounded-xl border p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 space-y-1">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline">
                                #{citation.position}
                              </Badge>
                              <p className="truncate text-sm font-medium">
                                {citation.title || citation.domain}
                              </p>
                            </div>
                            <p className="text-muted-foreground truncate text-xs">
                              {domainFromUrl(citation.url) || citation.domain}
                            </p>
                          </div>
                          <a
                            href={citation.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-muted-foreground hover:text-foreground inline-flex shrink-0 items-center gap-1 text-xs font-medium transition-colors"
                          >
                            Open
                            <ArrowUpRightIcon className="size-3.5" />
                          </a>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          <Badge
                            variant="secondary"
                            className={
                              typeTone[citation.type.toLowerCase()] ?? ""
                            }
                          >
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
                        </div>
                        {citation.snippet ? (
                          <p className="text-muted-foreground mt-3 text-sm leading-6">
                            {citation.snippet}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Entity Mentions</CardTitle>
              <CardDescription>
                Brands and tracked entities that surfaced in this response.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {runDetail.mentions?.length ? (
                runDetail.mentions.map((mention) => (
                  <div
                    key={String(mention.entityId ?? mention.slug)}
                    className="rounded-xl border p-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium">{mention.name}</p>
                        <p className="text-muted-foreground text-xs">
                          {titleCase(mention.kind)}
                        </p>
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
                    {mention.matchedTerms.length ? (
                      <p className="text-muted-foreground mt-2 text-xs">
                        Terms: {mention.matchedTerms.join(", ")}
                      </p>
                    ) : null}
                  </div>
                ))
              ) : (
                <InlineEmpty text="No tracked entity mentions were detected for this response." />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Run Evidence</CardTitle>
              <CardDescription>
                Screenshot and minimal debug context from this run.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {screenshotUrl ? (
                <a
                  href={screenshotUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="block overflow-hidden rounded-xl border"
                >
                  <img
                    src={screenshotUrl}
                    alt="Run screenshot"
                    className="max-h-[320px] w-full object-cover"
                    loading="lazy"
                  />
                </a>
              ) : (
                <InlineEmpty text="Screenshot preview unavailable for this run." />
              )}

              <div className="text-muted-foreground space-y-2 text-xs">
                {runDetail.run.deeplinkUsed ? (
                  <p className="break-all">
                    Deep link: {runDetail.run.deeplinkUsed}
                  </p>
                ) : null}
              </div>

              <details className="rounded-xl border p-3 text-xs">
                <summary className="text-muted-foreground cursor-pointer font-medium">
                  Technical artifacts
                </summary>
                <div className="text-muted-foreground mt-3 space-y-2">
                  <ArtifactRow
                    label="Evidence screenshot"
                    filePath={screenshotPath}
                  />
                  {responseScreenshotPath &&
                  responseScreenshotPath !== screenshotPath ? (
                    <ArtifactRow
                      label="Response screenshot"
                      filePath={responseScreenshotPath}
                    />
                  ) : null}
                  {pageScreenshotPath &&
                  pageScreenshotPath !== screenshotPath ? (
                    <ArtifactRow
                      label="Page screenshot"
                      filePath={pageScreenshotPath}
                    />
                  ) : null}
                  <ArtifactRow
                    label="Video"
                    filePath={outputPayload?.artifacts?.video ?? undefined}
                  />
                  <ArtifactRow
                    label="Trace"
                    filePath={outputPayload?.artifacts?.trace}
                  />
                  <ArtifactRow
                    label="Page HTML"
                    filePath={outputPayload?.artifacts?.pageHtml}
                  />
                  <ArtifactRow
                    label="Response HTML"
                    filePath={outputPayload?.artifacts?.responseHtml}
                  />
                  <ArtifactRow
                    label="Sources JSON"
                    filePath={outputPayload?.artifacts?.sources}
                  />
                  <ArtifactRow
                    label="Network JSON"
                    filePath={outputPayload?.artifacts?.network}
                  />
                  <ArtifactRow
                    label="Console JSON"
                    filePath={outputPayload?.artifacts?.console}
                  />
                </div>
              </details>

              {runDetail.run.warnings?.length ? (
                <details className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-900">
                  <summary className="cursor-pointer font-medium">
                    Runner warnings
                  </summary>
                  <div className="mt-2 space-y-2">
                    {runDetail.run.warnings.map((warning, index) => (
                      <p key={`${warning}-${index}`}>{warning}</p>
                    ))}
                  </div>
                </details>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function ArtifactRow({
  label,
  filePath,
}: {
  label: string;
  filePath: string | undefined;
}) {
  if (!filePath) {
    return null;
  }

  const servedUrl = artifactUrlFromPath(filePath);
  return (
    <p className="break-all">
      {label}:{" "}
      {servedUrl ? (
        <a
          href={servedUrl}
          target="_blank"
          rel="noreferrer"
          className="text-foreground underline underline-offset-2"
        >
          Open artifact
        </a>
      ) : (
        filePath
      )}
    </p>
  );
}
