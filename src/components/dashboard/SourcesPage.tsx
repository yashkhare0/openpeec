import type { Id } from "../../../convex/_generated/dataModel";
import { MoreHorizontal, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { InlineEmpty } from "./components/EmptyState";

type TrackedKind = "brand" | "competitor" | "product" | "feature" | "other";

export type SourceLatestResponse = {
  runId: Id<"promptRuns">;
  promptId: Id<"prompts">;
  promptExcerpt: string;
  providerName: string;
  startedAt: number;
  responseSummary: string;
  position: number;
};

export type SourceItem = {
  domain: string;
  type: string;
  citations: number;
  responseCount: number;
  promptCount: number;
  usedShare: number;
  avgCitationsPerRun: number;
  avgQualityScore?: number;
  avgPosition?: number;
  ownedShare: number;
  promptExcerpts?: string[];
  latestResponses?: SourceLatestResponse[];
  mentionedEntities?: string[];
};

export type TrackedEntity = {
  _id: Id<"trackedEntities">;
  name: string;
  kind: TrackedKind;
  ownedDomains?: string[];
  active: boolean;
};

type SourcesPageProps = {
  loading?: boolean;
  sources: SourceItem[];
  onOpenSource?: (domain: string) => void;
  promptFilter?: {
    promptId: Id<"prompts">;
    promptExcerpt: string;
  } | null;
  onPromptFilterClear?: () => void;
};

type TrackedEntitiesSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entities: TrackedEntity[];
  newEntityName: string;
  onNewEntityName: (value: string) => void;
  newEntityKind: TrackedKind;
  onNewEntityKind: (value: TrackedKind) => void;
  newEntityDomain: string;
  onNewEntityDomain: (value: string) => void;
  onCreateEntity: (args: {
    name: string;
    kind: TrackedKind;
    ownedDomains?: string[];
  }) => Promise<Id<"trackedEntities">>;
  onUpdateEntity: (args: {
    id: Id<"trackedEntities">;
    name?: string;
    active?: boolean;
  }) => Promise<Id<"trackedEntities">>;
  onDeleteEntity: (args: {
    id: Id<"trackedEntities">;
  }) => Promise<Id<"trackedEntities">>;
};

const trackedKindOptions: TrackedKind[] = [
  "brand",
  "competitor",
  "product",
  "feature",
  "other",
];

function titleCase(value: string): string {
  return value
    .split("_")
    .map((item) => item.charAt(0).toUpperCase() + item.slice(1).toLowerCase())
    .join(" ");
}

function formatPercent(value: number | undefined): string {
  if (value === undefined) return "-";
  return `${Math.round(value)}%`;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Action failed.";
}

export function TrackedEntitiesSheet({
  open,
  onOpenChange,
  entities,
  newEntityName,
  onNewEntityName,
  newEntityKind,
  onNewEntityKind,
  newEntityDomain,
  onNewEntityDomain,
  onCreateEntity,
  onUpdateEntity,
  onDeleteEntity,
}: TrackedEntitiesSheetProps) {
  const createEntity = async () => {
    if (!newEntityName.trim()) {
      toast.error("Entity name is required.");
      return;
    }
    const ownedDomains = newEntityDomain
      .split(",")
      .map((d) => d.trim())
      .filter(Boolean);
    try {
      await onCreateEntity({
        name: newEntityName.trim(),
        kind: newEntityKind,
        ownedDomains: ownedDomains.length ? ownedDomains : undefined,
      });
      onNewEntityName("");
      onNewEntityDomain("");
      toast.success("Tracked entity created.");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const renameEntity = async (
    id: Id<"trackedEntities">,
    currentName: string
  ) => {
    const next = window.prompt("New entity name", currentName);
    if (!next || next.trim() === currentName) return;
    try {
      await onUpdateEntity({ id, name: next.trim() });
      toast.success("Tracked entity updated.");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const toggleEntityActive = async (entity: TrackedEntity) => {
    try {
      await onUpdateEntity({ id: entity._id, active: !entity.active });
      toast.success(entity.active ? "Entity paused." : "Entity resumed.");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const deleteEntity = async (id: Id<"trackedEntities">) => {
    try {
      await onDeleteEntity({ id });
      toast.success("Entity deleted.");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Tracked Entities</SheetTitle>
          <SheetDescription className="sr-only">
            Add, update, pause, or delete tracked entities.
          </SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4">
          <div className="grid gap-2 rounded-lg border p-3">
            <Input
              value={newEntityName}
              onChange={(e) => onNewEntityName(e.target.value)}
              aria-label="Entity name"
              placeholder="Entity name"
              className="h-8"
            />
            <Select
              value={newEntityKind}
              onValueChange={(v) => onNewEntityKind(v as TrackedKind)}
            >
              <SelectTrigger className="h-8" aria-label="Entity kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {trackedKindOptions.map((kind) => (
                  <SelectItem key={kind} value={kind}>
                    {titleCase(kind)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={newEntityDomain}
              onChange={(e) => onNewEntityDomain(e.target.value)}
              aria-label="Owned domains"
              placeholder="Owned domains"
              className="h-8"
            />
            <Button size="sm" onClick={() => void createEntity()}>
              Add entity
            </Button>
          </div>

          {entities.length === 0 ? (
            <InlineEmpty text="No tracked entities yet." />
          ) : (
            <div className="flex flex-col gap-2">
              {entities.map((entity) => {
                const ownedDomains =
                  (entity.ownedDomains ?? []).join(", ") || "No domains";

                return (
                  <div
                    key={String(entity._id)}
                    className="rounded-lg border p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {entity.name}
                        </p>
                        <p className="text-muted-foreground line-clamp-2 text-xs">
                          {titleCase(entity.kind)} | {ownedDomains}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Badge
                          variant={entity.active ? "default" : "secondary"}
                          className={cn(
                            entity.active
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300"
                              : ""
                          )}
                        >
                          {entity.active ? "Active" : "Paused"}
                        </Badge>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Open actions for ${entity.name}`}
                            >
                              <MoreHorizontal />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-36">
                            <DropdownMenuGroup>
                              <DropdownMenuItem
                                onSelect={() =>
                                  void renameEntity(entity._id, entity.name)
                                }
                              >
                                Rename
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onSelect={() => void toggleEntityActive(entity)}
                              >
                                {entity.active ? "Pause" : "Resume"}
                              </DropdownMenuItem>
                            </DropdownMenuGroup>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              onSelect={() => void deleteEntity(entity._id)}
                            >
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function SourcesPage({
  loading = false,
  sources,
  onOpenSource,
  promptFilter,
  onPromptFilterClear,
}: SourcesPageProps) {
  const visibleSources = promptFilter
    ? sources.filter((source) =>
        source.latestResponses?.some(
          (response) => response.promptId === promptFilter.promptId
        )
      )
    : sources;

  const ownedSourceCount = visibleSources.filter(
    (source) => source.ownedShare > 0
  ).length;
  const totalResponseCount = visibleSources.reduce(
    (sum, source) => sum + source.responseCount,
    0
  );
  const avgQuality = (() => {
    const values = visibleSources
      .map((source) => source.avgQualityScore)
      .filter((value): value is number => typeof value === "number");
    if (!values.length) return undefined;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  })();
  const typeMix = buildTypeMix(visibleSources);

  return (
    <div className="flex flex-col gap-6 py-4 md:py-6">
      <div className="space-y-6 px-4 lg:px-6">
        <SourcesPageHeader
          loading={loading}
          totalDomains={visibleSources.length}
          ownedDomains={ownedSourceCount}
          totalResponses={totalResponseCount}
          avgQuality={avgQuality}
        />

        {promptFilter ? (
          <div className="flex items-center gap-2 rounded-xl border border-highlight/40 bg-highlight/[0.06] px-3 py-2.5">
            <span className="font-mono text-[10px] tracking-[0.24em] text-highlight-foreground/80 uppercase">
              Filtered by prompt
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
              {promptFilter.promptExcerpt}
            </span>
            {onPromptFilterClear ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={onPromptFilterClear}
                aria-label="Clear prompt filter"
              >
                <X data-icon="inline-start" />
                Clear
              </Button>
            ) : null}
          </div>
        ) : null}

        {typeMix.total > 0 ? <SourceTypeMix mix={typeMix} /> : null}

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className="h-24 animate-pulse rounded-xl border border-border/60 bg-card/40"
              />
            ))}
          </div>
        ) : visibleSources.length ? (
          <ol className="flex flex-col gap-2">
            {visibleSources.map((source, index) => (
              <SourceStrip
                key={source.domain}
                source={source}
                rank={index + 1}
                onOpenSource={onOpenSource}
              />
            ))}
          </ol>
        ) : (
          <article className="rounded-xl border border-border/70 bg-card/60 p-6">
            <InlineEmpty
              text={
                promptFilter
                  ? "No source analytics matched this prompt."
                  : "No source analytics available yet."
              }
            />
          </article>
        )}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Editorial header — eyebrow, masthead, totals
// -----------------------------------------------------------------------------

function SourcesPageHeader({
  loading,
  totalDomains,
  ownedDomains,
  totalResponses,
  avgQuality,
}: {
  loading: boolean;
  totalDomains: number;
  ownedDomains: number;
  totalResponses: number;
  avgQuality: number | undefined;
}) {
  return (
    <header className="flex flex-col gap-4 border-b border-border/60 pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-2">
        <p className="font-mono text-[10px] tracking-[0.32em] text-muted-foreground uppercase">
          GEO Pulse / Sources
        </p>
        <h1 className="font-display text-4xl font-extrabold leading-[1.05] tracking-[-0.022em] text-foreground sm:text-[2.75rem]">
          Who&apos;s citing your topics.
        </h1>
        <p className="text-muted-foreground text-sm max-w-xl">
          Every domain that an AI provider has cited in your monitored
          prompts. Track competitor share, find under-cited owned
          domains, and pivot the leaderboard to a single prompt when
          you need to.
        </p>
      </div>
      <dl className="flex shrink-0 items-end gap-6 font-mono text-[11px] tracking-[0.18em] text-muted-foreground uppercase">
        <SourcesMetaStat
          label="Domains"
          value={totalDomains.toString()}
          loading={loading}
        />
        <SourcesMetaStat
          label="Owned"
          value={ownedDomains.toString()}
          loading={loading}
          tone={ownedDomains > 0 ? "highlight" : "neutral"}
        />
        <SourcesMetaStat
          label="Responses"
          value={totalResponses.toString()}
          loading={loading}
        />
        <SourcesMetaStat
          label="Avg quality"
          value={
            typeof avgQuality === "number" ? Math.round(avgQuality).toString() : "-"
          }
          loading={loading}
        />
      </dl>
    </header>
  );
}

function SourcesMetaStat({
  label,
  value,
  loading,
  tone = "neutral",
}: {
  label: string;
  value: string;
  loading: boolean;
  tone?: "neutral" | "highlight";
}) {
  return (
    <div className="text-right">
      <dt>{label}</dt>
      <dd
        className={cn(
          "font-display text-xl font-bold tabular-nums tracking-tight",
          tone === "highlight"
            ? "text-highlight-foreground"
            : "text-foreground"
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
// Source-type mix bar — same visual grammar as OverviewPage source mix,
// but inline (compact) here since the leaderboard is the main surface.
// -----------------------------------------------------------------------------

const TYPE_PALETTE: Record<string, string> = {
  docs: "var(--chart-1)",
  editorial: "var(--chart-3)",
  ugc: "var(--chart-2)",
  social: "var(--chart-5)",
  corporate: "var(--chart-4)",
  other: "var(--muted-foreground)",
};

function typeColor(type: string, fallbackIndex: number) {
  return (
    TYPE_PALETTE[type as keyof typeof TYPE_PALETTE] ??
    `var(--chart-${(fallbackIndex % 5) + 1})`
  );
}

type TypeMixEntry = { type: string; citations: number; share: number };
type TypeMix = { total: number; entries: TypeMixEntry[] };

function buildTypeMix(sources: SourceItem[]): TypeMix {
  const totals = new Map<string, number>();
  for (const source of sources) {
    totals.set(source.type, (totals.get(source.type) ?? 0) + source.citations);
  }
  const total = [...totals.values()].reduce((sum, value) => sum + value, 0);
  const entries = [...totals.entries()]
    .map(([type, citations]) => ({
      type,
      citations,
      share: total ? (citations / total) * 100 : 0,
    }))
    .sort((a, b) => b.citations - a.citations);
  return { total, entries };
}

function SourceTypeMix({ mix }: { mix: TypeMix }) {
  return (
    <section className="space-y-3 rounded-xl border border-border/70 bg-card/60 p-4">
      <div className="flex items-end justify-between gap-3">
        <p className="font-mono text-[10px] tracking-[0.32em] text-muted-foreground uppercase">
          Source mix
        </p>
        <p className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
          By type
        </p>
      </div>
      <div className="flex h-3 w-full overflow-hidden rounded-full border border-border/50 bg-muted/20">
        {mix.entries.map((entry, index) => (
          <span
            key={entry.type}
            title={`${entry.type} — ${Math.round(entry.share)}%`}
            className="h-full"
            style={{
              width: `${entry.share}%`,
              backgroundColor: typeColor(entry.type, index),
            }}
          />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-5 gap-y-1.5">
        {mix.entries.map((entry, index) => (
          <li
            key={entry.type}
            className="flex items-center gap-2 text-sm"
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: typeColor(entry.type, index) }}
            />
            <span className="font-medium capitalize text-foreground">
              {entry.type}
            </span>
            <span className="font-mono text-[11px] tabular-nums tracking-wider text-muted-foreground">
              {entry.citations} · {Math.round(entry.share)}%
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// -----------------------------------------------------------------------------
// Source strip — one domain per row, GEO-leaderboard pattern
// -----------------------------------------------------------------------------

function SourceStrip({
  source,
  rank,
  onOpenSource,
}: {
  source: SourceItem;
  rank: number;
  onOpenSource?: (domain: string) => void;
}) {
  const canOpen = Boolean(onOpenSource);
  const isOwned = source.ownedShare > 0;
  const latestResponse = source.latestResponses?.[0];
  const mostUsedBy = getMostUsedProvider(source.latestResponses);
  const shareWidth = Math.max(0, Math.min(100, source.usedShare));

  const open = () => onOpenSource?.(source.domain);

  return (
    <li>
      <article
        role={canOpen ? "button" : undefined}
        tabIndex={canOpen ? 0 : undefined}
        aria-label={canOpen ? `Open source details for ${source.domain}` : undefined}
        onClick={canOpen ? open : undefined}
        onKeyDown={
          canOpen
            ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  open();
                }
              }
            : undefined
        }
        className={cn(
          "group grid items-center gap-4 rounded-xl border bg-card/60 px-4 py-3.5 transition-colors sm:grid-cols-[28px_1fr_180px_84px] sm:gap-5",
          canOpen && "cursor-pointer hover:bg-foreground/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          isOwned
            ? "border-highlight/40 bg-highlight/[0.06]"
            : "border-border/70"
        )}
      >
        {/* Rank chip */}
        <span
          className={cn(
            "font-mono text-[11px] tabular-nums tracking-wider hidden sm:inline-block",
            isOwned ? "text-highlight-foreground" : "text-muted-foreground"
          )}
        >
          {String(rank).padStart(2, "0")}
        </span>

        {/* Domain + metadata */}
        <div className="min-w-0 space-y-1.5">
          <div className="flex items-center gap-2">
            <SourceFavicon domain={source.domain} />
            <span className="truncate font-semibold text-sm text-foreground">
              {source.domain}
            </span>
            {isOwned ? (
              <Badge
                variant="outline"
                className="border-highlight/50 bg-highlight/15 text-highlight-foreground font-mono text-[9px] uppercase tracking-widest"
              >
                Owned
              </Badge>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
            <span>{source.type}</span>
            {source.avgQualityScore !== undefined ? (
              <span>Q {Math.round(source.avgQualityScore)}</span>
            ) : null}
            {source.avgPosition !== undefined ? (
              <span>Pos {source.avgPosition.toFixed(1)}</span>
            ) : null}
            <span>{source.responseCount} response{source.responseCount === 1 ? "" : "s"}</span>
            {mostUsedBy !== "-" ? (
              <span>Via {mostUsedBy}</span>
            ) : null}
            {latestResponse ? (
              <span>{formatFreshness(latestResponse.startedAt)}</span>
            ) : null}
          </div>
          {latestResponse ? (
            <p className="line-clamp-1 text-xs text-muted-foreground/90">
              Latest: <span className="text-foreground/85">{latestResponse.promptExcerpt}</span>
            </p>
          ) : null}
        </div>

        {/* Share bar */}
        <div className="hidden sm:block">
          <div
            className="relative h-2 w-full overflow-hidden rounded-full bg-muted/40"
            role="presentation"
          >
            <div
              className={cn(
                "absolute inset-y-0 left-0 rounded-full",
                isOwned ? "bg-highlight" : "bg-foreground/80"
              )}
              style={{ width: `${shareWidth}%` }}
            />
          </div>
        </div>

        {/* Used share % */}
        <div className="text-right">
          <p
            className={cn(
              "font-display text-2xl font-extrabold tabular-nums tracking-tight",
              isOwned ? "text-highlight-foreground" : "text-foreground"
            )}
          >
            {formatPercent(source.usedShare)}
          </p>
          <p className="font-mono text-[9px] tracking-[0.24em] text-muted-foreground uppercase">
            Share
          </p>
        </div>
      </article>
    </li>
  );
}

function SourceFavicon({ domain }: { domain: string }) {
  return (
    <span className="bg-muted/40 inline-flex size-5 shrink-0 items-center justify-center rounded">
      <img
        src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
        alt=""
        className="size-3.5 rounded-sm"
        onError={(event) => {
          (event.target as HTMLImageElement).style.display = "none";
        }}
        loading="lazy"
      />
    </span>
  );
}

function formatFreshness(timestamp: number) {
  const minutes = Math.max(1, Math.round((Date.now() - timestamp) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function getMostUsedProvider(
  responses: SourceLatestResponse[] | undefined
): string {
  if (!responses?.length) return "-";

  const counts = new Map<string, number>();
  for (const response of responses) {
    counts.set(
      response.providerName,
      (counts.get(response.providerName) ?? 0) + 1
    );
  }

  return (
    Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "-"
  );
}
