import { useMemo, useState, type ReactNode } from "react";
import type { Id } from "../../../convex/_generated/dataModel";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { DashboardTableCardSkeleton } from "./components/LoadingState";

type BrowserEngine = "playwright" | "camoufox" | "nodriver";

type ProviderRun = {
  runId: Id<"promptRuns">;
  providerSlug: string;
  providerName: string;
  channelName?: string;
  sessionMode?: "guest" | "stored";
  browserEngine?: BrowserEngine;
  runner?: string;
  status: string;
  startedAt: number;
  finishedAt?: number;
  latencyMs?: number;
  responseSummary?: string;
  sourceCount?: number;
  citationCount: number;
  warnings?: string[];
};

type RunGroupRow = {
  id: string;
  promptId: Id<"prompts">;
  promptExcerpt: string;
  runLabel?: string;
  status: string;
  queuedAt: number;
  startedAt: number;
  finishedAt?: number;
  sourceCount: number;
  citationCount: number;
  providers: ProviderRun[];
};

export function RunsPage({
  loading = false,
  groups,
  selectedRunGroupId,
  onOpenRunGroup,
  onOpenPrompt,
}: {
  loading?: boolean;
  groups: RunGroupRow[];
  selectedRunGroupId: string | null;
  onOpenRunGroup: (runGroupId: string) => void;
  onOpenPrompt: (promptId: Id<"prompts">) => void;
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");

  const filteredGroups = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return groups.filter((group) => {
      if (status !== "all" && group.status !== status) {
        return false;
      }
      if (!needle) {
        return true;
      }
      return `${group.promptExcerpt} ${group.runLabel ?? ""} ${group.status} ${group.providers
        .map(
          (run) =>
            `${run.providerName} ${run.providerSlug} ${run.channelName ?? ""} ${formatBrowserEngine(resolveBrowserEngine(run))} ${formatSessionMode(run.sessionMode)} ${run.runner ?? ""} ${run.status} ${formatDuration(getRuntimeMs(run))} ${run.responseSummary ?? ""} ${(run.warnings ?? []).join(" ")}`
        )
        .join(" ")}`
        .toLowerCase()
        .includes(needle);
    });
  }, [groups, search, status]);

  return (
    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      <div className="px-4 lg:px-6">
        {loading ? (
          <DashboardTableCardSkeleton titleWidth="w-16" rows={6} columns={6} />
        ) : (
          <Card>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap justify-end gap-2">
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search runs..."
                  className="h-8 w-[240px]"
                />
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="h-8 w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="queued">Queued</SelectItem>
                    <SelectItem value="running">Running</SelectItem>
                    <SelectItem value="blocked">Blocked</SelectItem>
                    <SelectItem value="success">Success</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {filteredGroups.length === 0 ? (
                <InlineEmpty text="No runs match the current filters." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Queued</TableHead>
                      <TableHead>Prompt</TableHead>
                      <TableHead>Providers</TableHead>
                      <TableHead className="text-right">Runtime</TableHead>
                      <TableHead className="text-right">
                        Sources / citations
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredGroups.map((group) => {
                      const visibleRunLabel = getVisibleRunLabel(group);

                      return (
                        <TableRow
                          key={group.id}
                          aria-label={`Open run group for ${group.promptExcerpt}`}
                          className={cn(
                            clickableTableRowClassName,
                            selectedRunGroupId === group.id && "bg-muted/30"
                          )}
                          tabIndex={0}
                          onClick={() => onOpenRunGroup(group.id)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              onOpenRunGroup(group.id);
                            }
                          }}
                        >
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <span className="font-medium">
                                {formatFreshness(group.queuedAt)}
                              </span>
                              <RunDetailsTooltip group={group} />
                            </div>
                          </TableCell>
                          <TableCell>
                            <button
                              type="button"
                              className="hover:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 rounded-sm text-left transition-colors outline-none focus-visible:ring-3"
                              onClick={(event) => {
                                event.stopPropagation();
                                onOpenPrompt(group.promptId);
                              }}
                            >
                              <p className="font-medium">
                                {group.promptExcerpt}
                              </p>
                              {visibleRunLabel ? (
                                <p className="text-muted-foreground mt-1 text-xs">
                                  {visibleRunLabel}
                                </p>
                              ) : null}
                            </button>
                          </TableCell>
                          <TableCell>
                            <div className="flex max-w-[360px] flex-wrap items-center gap-1.5">
                              {group.providers.map((run) => (
                                <ProviderSummary
                                  key={String(run.runId)}
                                  run={run}
                                />
                              ))}
                            </div>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatGroupRuntime(group)}
                          </TableCell>
                          <TableCell
                            className="text-right tabular-nums"
                            aria-label={`${group.sourceCount} sources, ${group.citationCount} citations`}
                          >
                            {group.sourceCount} / {group.citationCount}
                          </TableCell>
                        </TableRow>
                      );
                    })}
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

function RunDetailsTooltip({ group }: { group: RunGroupRow }) {
  const providerDetails = group.providers.map((run) => ({
    key: String(run.runId),
    text: [
      `${run.providerName}: ${titleCase(run.status)}`,
      `engine ${formatBrowserEngine(resolveBrowserEngine(run))}`,
      `session ${formatSessionMode(run.sessionMode)}`,
      `runtime ${formatDuration(getRuntimeMs(run))}`,
      run.runner ? `runner ${run.runner}` : undefined,
    ]
      .filter(Boolean)
      .join(", "),
  }));

  return (
    <RowControl>
      <InfoTooltip label="Run details">
        <div className="flex flex-col gap-1 text-left">
          <span>Queued: {formatExactTimestamp(group.queuedAt)}</span>
          <span>Started: {formatExactTimestamp(group.startedAt)}</span>
          {typeof group.finishedAt === "number" ? (
            <span>Finished: {formatExactTimestamp(group.finishedAt)}</span>
          ) : null}
          {providerDetails.map((detail) => (
            <span key={detail.key}>{detail.text}</span>
          ))}
        </div>
      </InfoTooltip>
    </RowControl>
  );
}

function ProviderSummary({ run }: { run: ProviderRun }) {
  return (
    <Badge variant={providerStatusBadgeVariant(run.status)}>
      {run.providerName} {titleCase(run.status)}
    </Badge>
  );
}

function RowControl({ children }: { children: ReactNode }) {
  return (
    <span
      className="inline-flex"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {children}
    </span>
  );
}

function getVisibleRunLabel(
  group: Pick<RunGroupRow, "promptExcerpt" | "runLabel">
) {
  const runLabel = group.runLabel?.trim();
  if (!runLabel) {
    return undefined;
  }
  if (normalizeDisplayText(runLabel) === "manual run") {
    return undefined;
  }
  if (
    normalizeDisplayText(runLabel) === normalizeDisplayText(group.promptExcerpt)
  ) {
    return undefined;
  }
  return runLabel;
}

function normalizeDisplayText(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function getRuntimeMs(
  run: Pick<ProviderRun, "latencyMs" | "startedAt" | "finishedAt">
) {
  if (typeof run.latencyMs === "number") {
    return run.latencyMs;
  }
  if (typeof run.finishedAt === "number") {
    return Math.max(0, run.finishedAt - run.startedAt);
  }
  return undefined;
}

function formatGroupRuntime(group: RunGroupRow) {
  const providerRuntime = Math.max(
    ...group.providers
      .map((run) => getRuntimeMs(run))
      .filter((value): value is number => typeof value === "number")
  );
  if (Number.isFinite(providerRuntime)) {
    return formatDuration(providerRuntime);
  }
  if (typeof group.finishedAt === "number") {
    return formatDuration(Math.max(0, group.finishedAt - group.startedAt));
  }
  return "-";
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

function resolveBrowserEngine(
  run: Pick<ProviderRun, "browserEngine" | "runner">
): BrowserEngine | undefined {
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

function formatSessionMode(mode: ProviderRun["sessionMode"]) {
  if (mode === "stored") {
    return "Stored session";
  }
  if (mode === "guest") {
    return "Guest session";
  }
  return "Unknown session";
}

function providerStatusBadgeVariant(
  status: string
): "secondary" | "destructive" | "outline" {
  if (status === "success") {
    return "secondary";
  }
  if (status === "failed") {
    return "destructive";
  }
  return "outline";
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

function formatExactTimestamp(timestamp: number) {
  return new Date(timestamp).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  });
}
