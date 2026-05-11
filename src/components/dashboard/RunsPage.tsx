import { useMemo, type ComponentProps, type ReactNode } from "react";
import {
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { InlineEmpty } from "./components/EmptyState";

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

  const totalRuns = filteredGroups.reduce(
    (sum, group) => sum + group.providers.length,
    0
  );
  const totalSources = filteredGroups.reduce(
    (sum, group) => sum + group.sourceCount,
    0
  );
  const failedRuns = filteredGroups.reduce(
    (sum, group) =>
      sum +
      group.providers.filter((p) => p.status === "failed" || p.status === "blocked")
        .length,
    0
  );

  return (
    <div className="flex flex-col gap-6 py-4 md:py-6">
      <div className="space-y-6 px-4 lg:px-6">
        <RunsPageHeader
          loading={loading}
          totalGroups={filteredGroups.length}
          totalRuns={totalRuns}
          totalSources={totalSources}
          failedRuns={failedRuns}
        />

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className="h-20 animate-pulse rounded-xl border border-border/60 bg-card/40"
              />
            ))}
          </div>
        ) : filteredGroups.length === 0 ? (
          <article className="rounded-xl border border-border/70 bg-card/60 p-6">
            <InlineEmpty text="No runs match the current filters." />
          </article>
        ) : (
          <ul className="flex flex-col gap-2">
            {filteredGroups.map((group) => (
              <RunGroupStrip
                key={group.id}
                group={group}
                selected={selectedRunGroupId === group.id}
                onOpenRun={onOpenRun}
                onOpenRunGroup={onOpenRunGroup}
                onOpenPrompt={onOpenPrompt}
                onCancelRuns={onCancelRuns}
                onDeleteRuns={onDeleteRuns}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Editorial header — mono caps eyebrow, masthead headline, scan-at-a-glance stats
// -----------------------------------------------------------------------------

function RunsPageHeader({
  loading,
  totalGroups,
  totalRuns,
  totalSources,
  failedRuns,
}: {
  loading: boolean;
  totalGroups: number;
  totalRuns: number;
  totalSources: number;
  failedRuns: number;
}) {
  return (
    <header className="flex flex-col gap-4 border-b border-border/60 pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-2">
        <p className="font-mono text-[10px] tracking-[0.32em] text-muted-foreground uppercase">
          GEO Pulse / Runs
        </p>
        <h1 className="font-display text-4xl font-extrabold leading-[1.05] tracking-[-0.022em] text-foreground sm:text-[2.75rem]">
          Every prompt, every provider, every run.
        </h1>
        <p className="text-muted-foreground text-sm max-w-xl">
          One row per queued run group, with a status chip per provider. Click
          a chip to see that provider&apos;s response, or the row to compare all
          providers side-by-side.
        </p>
      </div>
      <dl className="flex shrink-0 items-end gap-6 font-mono text-[11px] tracking-[0.18em] text-muted-foreground uppercase">
        <RunsMetaStat label="Groups" value={totalGroups.toString()} loading={loading} />
        <RunsMetaStat label="Runs" value={totalRuns.toString()} loading={loading} />
        <RunsMetaStat label="Sources" value={totalSources.toString()} loading={loading} />
        <RunsMetaStat
          label="Failed"
          value={failedRuns.toString()}
          loading={loading}
          tone={failedRuns > 0 ? "negative" : "neutral"}
        />
      </dl>
    </header>
  );
}

function RunsMetaStat({
  label,
  value,
  loading,
  tone = "neutral",
}: {
  label: string;
  value: string;
  loading: boolean;
  tone?: "neutral" | "negative";
}) {
  return (
    <div className="text-right">
      <dt>{label}</dt>
      <dd
        className={cn(
          "font-display text-xl font-bold tabular-nums tracking-tight",
          tone === "negative" ? "text-negative" : "text-foreground"
        )}
      >
        {loading ? (
          <span className="inline-block h-5 w-10 animate-pulse rounded-sm bg-muted/60" />
        ) : (
          value
        )}
      </dd>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Run-group strip — dense one-line-per-group with per-provider status chips
// -----------------------------------------------------------------------------

function RunGroupStrip({
  group,
  selected,
  onOpenRun,
  onOpenRunGroup,
  onOpenPrompt,
  onCancelRuns,
  onDeleteRuns,
}: {
  group: RunGroupRow;
  selected: boolean;
  onOpenRun: (runId: Id<"promptRuns">) => void;
  onOpenRunGroup: (runGroupId: string) => void;
  onOpenPrompt: (promptId: Id<"prompts">) => void;
  onCancelRuns: (runIds: Array<Id<"promptRuns">>) => Promise<void>;
  onDeleteRuns: (runIds: Array<Id<"promptRuns">>) => Promise<void>;
}) {
  const visibleRunLabel = getVisibleRunLabel(group);
  const summary = summarizeProviderStatuses(group.providers);
  return (
    <li>
      <article
        role="button"
        tabIndex={0}
        aria-label={`Open run group for ${group.promptExcerpt}`}
        onClick={() => onOpenRunGroup(group.id)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onOpenRunGroup(group.id);
          }
        }}
        className={cn(
          "group flex cursor-pointer flex-col gap-3 rounded-xl border border-border/70 bg-card/60 px-4 py-4 transition-colors hover:border-foreground/20 hover:bg-foreground/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-row sm:items-center sm:gap-5 sm:py-3.5",
          selected && "border-foreground/30 bg-foreground/[0.06]"
        )}
      >
        {/* LEFT: timestamp + prompt */}
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex items-center gap-2 font-mono text-[10px] tracking-[0.24em] text-muted-foreground uppercase">
            <span>{formatFreshness(group.queuedAt)}</span>
            <span className="text-muted-foreground/40">·</span>
            <span>{group.providers.length} provider{group.providers.length === 1 ? "" : "s"}</span>
            <RunTimingTooltip group={group} />
          </div>
          <button
            type="button"
            className="hover:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 rounded-sm text-left outline-none focus-visible:ring-3"
            onClick={(event) => {
              event.stopPropagation();
              onOpenPrompt(group.promptId);
            }}
          >
            <p className="font-semibold text-sm text-foreground line-clamp-2">
              {group.promptExcerpt}
            </p>
            {visibleRunLabel ? (
              <p className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground uppercase mt-1">
                {visibleRunLabel}
              </p>
            ) : null}
          </button>
        </div>

        {/* MIDDLE: per-provider status chips */}
        <RowControl>
          <ProviderStatusGrid providers={group.providers} onOpenRun={onOpenRun} />
        </RowControl>

        {/* RIGHT: tabular metrics + actions */}
        <div className="flex shrink-0 items-center gap-5">
          <MetricCell
            label="Runtime"
            value={formatGroupRuntime(group)}
          />
          <MetricCell
            label="Src / cit"
            value={`${group.sourceCount} / ${group.citationCount}`}
          />
          <RowControl>
            <GroupStatusPill status={summary.status} />
          </RowControl>
          <RowControl>
            <QueuedRunActions
              group={group}
              onCancelRuns={onCancelRuns}
              onDeleteRuns={onDeleteRuns}
            />
          </RowControl>
        </div>
      </article>
    </li>
  );
}

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="hidden text-right md:block">
      <p className="font-mono text-[9px] tracking-[0.24em] text-muted-foreground uppercase">
        {label}
      </p>
      <p className="font-display text-base font-bold tabular-nums tracking-tight text-foreground">
        {value}
      </p>
    </div>
  );
}

function ProviderStatusGrid({
  providers,
  onOpenRun,
}: {
  providers: ProviderRun[];
  onOpenRun: (runId: Id<"promptRuns">) => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex flex-wrap items-center gap-1.5">
          {providers.map((run) => (
            <ProviderStatusChip
              key={String(run.runId)}
              run={run}
              onOpenRun={onOpenRun}
            />
          ))}
        </div>
      </TooltipTrigger>
      <TooltipContent
        side="bottom"
        align="start"
        sideOffset={6}
        className="w-80 max-w-none p-2"
      >
        <ProviderStatusList providers={providers} />
      </TooltipContent>
    </Tooltip>
  );
}

function ProviderStatusChip({
  run,
  onOpenRun,
}: {
  run: ProviderRun;
  onOpenRun: (runId: Id<"promptRuns">) => void;
}) {
  const tone = providerChipTone(run.status);
  return (
    <button
      type="button"
      aria-label={`Open ${run.providerName} run (${formatProviderStatus(run.status)})`}
      onClick={(event) => {
        event.stopPropagation();
        onOpenRun(run.runId);
      }}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors hover:bg-foreground/5",
        tone.className
      )}
    >
      <ProviderStatusIcon status={run.status} className="size-3" />
      <span className="font-semibold normal-case tracking-normal">
        {shortProviderName(run.providerName)}
      </span>
    </button>
  );
}

function GroupStatusPill({ status }: { status: string }) {
  const tone = providerChipTone(status);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em]",
        tone.className
      )}
    >
      {formatProviderStatus(status)}
    </span>
  );
}

function providerChipTone(status: string): { className: string } {
  const normalized = status.toLowerCase();
  if (normalized === "success") {
    return {
      className: "border-positive/40 text-positive bg-positive/10",
    };
  }
  if (normalized === "failed" || normalized === "blocked") {
    return {
      className: "border-negative/40 text-negative bg-negative/10",
    };
  }
  if (normalized === "running") {
    return {
      className: "border-primary/40 text-primary bg-primary/10",
    };
  }
  if (normalized === "queued") {
    return {
      className: "border-highlight/50 text-highlight-foreground bg-highlight/15",
    };
  }
  return {
    className: "border-border/60 text-muted-foreground bg-muted/30",
  };
}

function shortProviderName(name: string) {
  const trimmed = name.trim();
  // Aliases so the chip stays narrow inside the row.
  if (trimmed === "Google AI Mode") return "Google AI";
  if (trimmed === "Mistral Le Chat") return "Le Chat";
  return trimmed;
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
