import type { Id } from "../../../convex/_generated/dataModel";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  onBack,
  onOpenPrompt,
  onOpenRun,
}: {
  loading?: boolean;
  runGroupDetail: RunGroupDetail | null | undefined;
  onBack: () => void;
  onOpenPrompt?: (promptId: Id<"prompts">) => void;
  onOpenRun?: (runId: Id<"promptRuns">) => void;
}) {
  if (loading) {
    return (
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <div className="px-4 lg:px-6">
          <DashboardCardSkeleton
            titleWidth="w-40"
            descriptionWidth="w-72"
            contentClassName="space-y-4"
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

  return (
    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      <div className="flex flex-wrap items-center gap-2 px-4 lg:px-6">
        <Button variant="outline" size="sm" onClick={onBack}>
          Back to runs
        </Button>
        {onOpenPrompt ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenPrompt(promptId)}
          >
            Open prompt
          </Button>
        ) : null}
      </div>

      <div className="grid gap-4 px-4 lg:px-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle>
                    {runGroupDetail.prompt?.excerpt ??
                      runGroupDetail.group.promptExcerpt}
                  </CardTitle>
                  <p className="text-muted-foreground mt-2 text-sm">
                    {runGroupDetail.prompt?.promptText ??
                      runGroupDetail.group.promptExcerpt}
                  </p>
                </div>
                <Badge variant="outline">
                  {titleCase(runGroupDetail.group.status)}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-4">
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
            </CardContent>
          </Card>

          {runGroupDetail.runs.map((run) => (
            <Card key={String(run._id)}>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <CardTitle>{run.providerName}</CardTitle>
                    <p className="text-muted-foreground text-xs">
                      {run.channelName ? `${run.channelName} | ` : ""}
                      {formatBrowserEngine(resolveBrowserEngine(run))} |{" "}
                      {run.sessionMode
                        ? formatSessionMode(run.sessionMode)
                        : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="secondary">{titleCase(run.status)}</Badge>
                    <Badge variant="outline">{formatRuntime(run)}</Badge>
                    <Badge variant="outline">
                      {run.sourceCount ?? run.citations.length} sources
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-muted/20 rounded-md border p-3">
                  <p className="text-sm leading-6 whitespace-pre-wrap">
                    {run.responseText?.trim() ||
                      run.responseSummary?.trim() ||
                      "No response text captured."}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {onOpenRun ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onOpenRun(run._id)}
                    >
                      Open response
                    </Button>
                  ) : null}
                  {run.evidencePath ? (
                    <Badge variant="outline">{run.evidencePath}</Badge>
                  ) : null}
                </div>

                {run.citations.length ? (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Sources</p>
                    <div className="grid gap-2 md:grid-cols-2">
                      {run.citations.slice(0, 8).map((citation) => (
                        <a
                          key={`${run._id}-${citation.position}-${citation.url}`}
                          href={citation.url}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:border-foreground/30 rounded-md border p-3 text-sm transition-colors"
                        >
                          <span className="font-medium">
                            {citation.title || citation.domain}
                          </span>
                          <span className="text-muted-foreground mt-1 block text-xs">
                            {citation.domain}
                          </span>
                        </a>
                      ))}
                    </div>
                  </div>
                ) : null}

                {run.mentions.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {run.mentions.slice(0, 8).map((mention) => (
                      <Badge
                        key={`${run._id}-${mention.name}`}
                        variant="outline"
                      >
                        {mention.name} · {mention.mentionCount}
                      </Badge>
                    ))}
                  </div>
                ) : null}

                {run.warnings?.length ? (
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    {run.warnings.join(" | ")}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Provider Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {runGroupDetail.runs.map((run) => (
              <div key={String(run._id)} className="rounded-md border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{run.providerName}</p>
                    <p className="text-muted-foreground text-xs">
                      {formatFreshness(run.startedAt)}
                    </p>
                  </div>
                  <Badge variant="outline">{titleCase(run.status)}</Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Badge variant="secondary">
                    {formatBrowserEngine(resolveBrowserEngine(run))}
                  </Badge>
                  {run.sessionMode ? (
                    <Badge variant="outline">
                      {formatSessionMode(run.sessionMode)}
                    </Badge>
                  ) : null}
                  <Badge variant="outline">{formatRuntime(run)}</Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-muted-foreground text-xs font-medium uppercase">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
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

function formatFreshness(timestamp: number) {
  const minutes = Math.max(1, Math.round((Date.now() - timestamp) / 60000));
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 48) {
    return `${hours}h ago`;
  }
  return `${Math.round(hours / 24)}d ago`;
}
