import { useMemo, type ComponentProps, type ReactNode } from "react";
import {
  ArrowUpRight,
  Ban,
  CheckCircle2,
  CircleAlert,
  CircleDashed,
  Clock3,
  LoaderCircle,
  MoreHorizontal,
  Trash2,
  XCircle,
} from "lucide-react";
import type { Id } from "../../../convex/_generated/dataModel";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { InlineEmpty } from "./components/EmptyState";
import { clickableTableRowClassName } from "./components/InfoTooltip";
import { DashboardTableCardSkeleton } from "./components/LoadingState";

type BrowserEngine = "playwright" | "camoufox" | "nodriver";
export type RunStatusFilterValue =
  | "queued"
  | "running"
  | "blocked"
  | "success"
  | "failed";

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
  searchValue,
  statusFilters,
  selectedRunGroupId,
  onOpenRun,
  onOpenRunGroup,
  onOpenPrompt,
  onCancelRuns,
  onDeleteRuns,
}: {
  loading?: boolean;
  groups: RunGroupRow[];
  searchValue: string;
  statusFilters: RunStatusFilterValue[];
  selectedRunGroupId: string | null;
  onOpenRun: (runId: Id<"promptRuns">) => void;
  onOpenRunGroup: (runGroupId: string) => void;
  onOpenPrompt: (promptId: Id<"prompts">) => void;
  onCancelRuns: (runIds: Array<Id<"promptRuns">>) => Promise<void>;
  onDeleteRuns: (runIds: Array<Id<"promptRuns">>) => Promise<void>;
}) {
  const filteredGroups = useMemo(() => {
    const needle = searchValue.trim().toLowerCase();
    return groups.filter((group) => {
      if (
        statusFilters.length > 0 &&
        !statusFilters.includes(group.status as RunStatusFilterValue)
      ) {
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
  }, [groups, searchValue, statusFilters]);

  return (
    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      <div className="px-4 lg:px-6">
        {loading ? (
          <DashboardTableCardSkeleton titleWidth="w-16" rows={6} columns={6} />
        ) : (
          <Card>
            <CardContent>
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
                      <TableHead className="w-10">
                        <span className="sr-only">Actions</span>
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
                              <RunTimingTooltip group={group} />
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
                            <ProviderSummary
                              group={group}
                              onOpenRun={onOpenRun}
                            />
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
                          <TableCell className="text-right">
                            <QueuedRunActions
                              group={group}
                              onCancelRuns={onCancelRuns}
                              onDeleteRuns={onDeleteRuns}
                            />
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

function RunTimingTooltip({ group }: { group: RunGroupRow }) {
  const startDelayMs = Math.max(0, group.startedAt - group.queuedAt);
  const runtimeMs = getGroupRuntimeMs(group);
  const finishedAt =
    typeof group.finishedAt === "number" ? group.finishedAt : undefined;
  const totalMs =
    typeof finishedAt === "number"
      ? Math.max(0, finishedAt - group.queuedAt)
      : undefined;

  return (
    <RowControl>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={`Timing for run queued ${formatFreshness(group.queuedAt)}`}
            className="text-muted-foreground hover:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 inline-flex size-5 items-center justify-center rounded-sm transition-colors outline-none focus-visible:ring-3"
          >
            <Clock3 className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-none">
          <div className="flex min-w-64 flex-col gap-3 text-left">
            <div className="flex items-center gap-1" aria-hidden="true">
              <span className="bg-foreground size-1.5 rounded-full" />
              <span className="bg-border h-px flex-1" />
              <span className="bg-foreground size-1.5 rounded-full" />
              <span className="bg-border h-px flex-1" />
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  finishedAt ? "bg-foreground" : "bg-muted-foreground"
                )}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <TimingPoint
                label="Queued"
                value={formatShortTimestamp(group.queuedAt)}
              />
              <TimingPoint
                label="Started"
                value={formatShortTimestamp(group.startedAt)}
              />
              <TimingPoint
                label="Finished"
                value={
                  finishedAt ? formatShortTimestamp(finishedAt) : "Pending"
                }
              />
            </div>
            <div className="bg-muted/50 grid grid-cols-3 gap-2 rounded-md p-2">
              <TimingMetric label="Wait" value={formatDuration(startDelayMs)} />
              <TimingMetric label="Runtime" value={formatDuration(runtimeMs)} />
              <TimingMetric label="Total" value={formatDuration(totalMs)} />
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </RowControl>
  );
}

function TimingPoint({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-muted-foreground text-[11px]">{label}</span>
      <span className="truncate text-xs font-medium">{value}</span>
    </div>
  );
}

function TimingMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-muted-foreground text-[11px]">{label}</span>
      <span className="truncate text-xs font-medium tabular-nums">{value}</span>
    </div>
  );
}

function ProviderSummary({
  group,
  onOpenRun,
}: {
  group: RunGroupRow;
  onOpenRun: (runId: Id<"promptRuns">) => void;
}) {
  const summary = summarizeProviderStatuses(group.providers);
  const primaryRun = getPrimaryProviderRun(group.providers, summary.status);

  return (
    <RowControl>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant={summary.variant}
            size="sm"
            disabled={!primaryRun}
            aria-label={
              primaryRun
                ? `Open ${primaryRun.providerName} run`
                : "No provider runs"
            }
            className="rounded-full"
            onClick={() => {
              if (primaryRun) {
                onOpenRun(primaryRun.runId);
              }
            }}
          >
            <ProviderStatusIcon
              status={summary.status}
              data-icon="inline-start"
            />
            {summary.label}
            {primaryRun ? <ArrowUpRight data-icon="inline-end" /> : null}
          </Button>
        </TooltipTrigger>
        <TooltipContent
          side="bottom"
          align="start"
          sideOffset={6}
          className="w-80 max-w-none p-2"
        >
          <ProviderStatusList providers={group.providers} />
        </TooltipContent>
      </Tooltip>
    </RowControl>
  );
}

function getPrimaryProviderRun(providers: ProviderRun[], status: string) {
  return (
    providers.find((run) => run.status === status) ??
    providers.find((run) => run.status === "success") ??
    providers[0]
  );
}

function ProviderStatusList({ providers }: { providers: ProviderRun[] }) {
  return (
    <ItemGroup
      role="list"
      aria-label="Provider run details"
      className="min-w-0 gap-1 text-left"
    >
      {providers.map((run) => (
        <Item
          key={String(run.runId)}
          role="listitem"
          size="xs"
          className="text-background flex-nowrap items-start border-transparent px-2 py-2"
        >
          <ItemMedia variant="icon" className="text-background/80">
            <ProviderStatusIcon status={run.status} className="size-4" />
          </ItemMedia>
          <ItemContent className="min-w-0">
            <ItemTitle className="text-background w-full text-xs">
              {run.providerName}
            </ItemTitle>
            <ItemDescription className="text-background/70 line-clamp-1 text-[11px]">
              {formatProviderRunMeta(run)}
            </ItemDescription>
            <ProviderRunStats run={run} />
          </ItemContent>
          <ItemActions className="text-background/70 self-start text-[11px] font-medium">
            {formatProviderStatus(run.status)}
          </ItemActions>
        </Item>
      ))}
    </ItemGroup>
  );
}

function ProviderRunStats({ run }: { run: ProviderRun }) {
  const stats = formatProviderRunStats(run);

  if (!stats) {
    return null;
  }

  return (
    <ItemDescription className="text-background/60 line-clamp-1 text-[11px]">
      {stats}
    </ItemDescription>
  );
}

function QueuedRunActions({
  group,
  onCancelRuns,
  onDeleteRuns,
}: {
  group: RunGroupRow;
  onCancelRuns: (runIds: Array<Id<"promptRuns">>) => Promise<void>;
  onDeleteRuns: (runIds: Array<Id<"promptRuns">>) => Promise<void>;
}) {
  const queuedRuns = group.providers.filter((run) => run.status === "queued");
  if (!queuedRuns.length) {
    return null;
  }

  const cancelQueuedRuns = async () => {
    await onCancelRuns(queuedRuns.map((run) => run.runId));
  };
  const deleteQueuedRuns = async () => {
    await onDeleteRuns(queuedRuns.map((run) => run.runId));
  };

  return (
    <RowControl>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Actions for queued runs in ${group.promptExcerpt}`}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => void cancelQueuedRuns()}>
              <XCircle />
              Cancel queued
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem
              variant="destructive"
              onClick={() => void deleteQueuedRuns()}
            >
              <Trash2 />
              Delete queued
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </RowControl>
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
  const providerRuntime = getGroupRuntimeMs(group);
  if (providerRuntime !== undefined) {
    return formatDuration(providerRuntime);
  }
  if (typeof group.finishedAt === "number") {
    return formatDuration(Math.max(0, group.finishedAt - group.startedAt));
  }
  return "-";
}

function getGroupRuntimeMs(group: RunGroupRow) {
  const providerRuntime = Math.max(
    ...group.providers
      .map((run) => getRuntimeMs(run))
      .filter((value): value is number => typeof value === "number")
  );
  if (Number.isFinite(providerRuntime)) {
    return providerRuntime;
  }
  if (typeof group.finishedAt === "number") {
    return Math.max(0, group.finishedAt - group.startedAt);
  }
  return undefined;
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

function formatProviderRunMeta(run: ProviderRun) {
  const engine = resolveBrowserEngine(run);
  const runtime = formatDuration(getRuntimeMs(run));
  const details = [
    run.channelName,
    engine ? formatBrowserEngine(engine) : undefined,
    run.sessionMode ? formatSessionMode(run.sessionMode) : undefined,
    runtime === "-" ? undefined : runtime,
  ].filter(Boolean);

  return details.length > 0 ? details.join(" · ") : "Run details unavailable";
}

function formatProviderRunStats(run: ProviderRun) {
  const stats = [
    typeof run.sourceCount === "number"
      ? countLabel(run.sourceCount, "source", "sources")
      : undefined,
    countLabel(run.citationCount, "citation", "citations"),
    run.warnings?.length
      ? countLabel(run.warnings.length, "warning", "warnings")
      : undefined,
  ].filter(Boolean);

  return stats.join(" · ");
}

function summarizeProviderStatuses(providers: ProviderRun[]): {
  label: string;
  status: string;
  variant: "secondary" | "destructive" | "outline";
} {
  const failed = countProviderStatus(providers, "failed");
  if (failed > 0) {
    return {
      label: countLabel(failed, "Error", "Errors"),
      status: "failed",
      variant: "destructive",
    };
  }

  const blocked = countProviderStatus(providers, "blocked");
  if (blocked > 0) {
    return {
      label: countLabel(blocked, "Blocked", "Blocked"),
      status: "blocked",
      variant: "outline",
    };
  }

  const running = countProviderStatus(providers, "running");
  if (running > 0) {
    return {
      label: countLabel(running, "Running", "Running"),
      status: "running",
      variant: "outline",
    };
  }

  const queued = countProviderStatus(providers, "queued");
  if (queued > 0) {
    return {
      label: countLabel(queued, "Queued", "Queued"),
      status: "queued",
      variant: "outline",
    };
  }

  const successful = countProviderStatus(providers, "success");
  if (successful === providers.length && providers.length > 0) {
    return {
      label: "Successful",
      status: "success",
      variant: "secondary",
    };
  }

  if (successful > 0) {
    return {
      label: countLabel(successful, "Successful", "Successful"),
      status: "success",
      variant: "secondary",
    };
  }

  return {
    label: "No providers",
    status: "unknown",
    variant: "outline",
  };
}

function countProviderStatus(providers: ProviderRun[], status: string) {
  return providers.filter((run) => run.status === status).length;
}

function countLabel(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function formatProviderStatus(status: string) {
  if (status === "success") {
    return "Successful";
  }
  if (status === "failed") {
    return "Error";
  }
  return titleCase(status);
}

function ProviderStatusIcon({
  status,
  className,
  ...props
}: {
  status: string;
} & ComponentProps<typeof CheckCircle2>) {
  const normalizedStatus = status.toLowerCase();

  if (normalizedStatus === "success") {
    return (
      <CheckCircle2 className={cn("text-primary", className)} {...props} />
    );
  }
  if (normalizedStatus === "failed") {
    return (
      <CircleAlert className={cn("text-destructive", className)} {...props} />
    );
  }
  if (normalizedStatus === "blocked") {
    return (
      <Ban className={cn("text-muted-foreground", className)} {...props} />
    );
  }
  if (normalizedStatus === "running") {
    return (
      <LoaderCircle
        className={cn("text-muted-foreground animate-spin", className)}
        {...props}
      />
    );
  }
  return (
    <CircleDashed
      className={cn("text-muted-foreground", className)}
      {...props}
    />
  );
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

function formatShortTimestamp(timestamp: number) {
  return new Date(timestamp).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
