import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { EmptyState, InlineEmpty } from "./components/EmptyState";
import { InfoTooltip } from "./components/InfoTooltip";

// =============================================================================
// GEO command center — daily-snapshot Overview.
//
// Design point of view: this page should answer the operator's first question
// every morning: "is my brand getting cited in AI answers, and what changed?"
// Editorial / instrumentation hybrid — Fraunces display numbers carry the
// emotional read, JetBrains Mono labels keep the data feel surgical, the
// existing Geist body face keeps the rest of the app cohesive.
//
// Layout reads top-down as a story:
//   1. Hero metric strip   — "where do we stand right now?"  (4 KPIs)
//   2. Provider matrix     — "who is citing us most? where is the gap?"
//   3. Top domains  | Mix  — "which sources are winning the citations?"
//   4. Prompt watchlist    — "which monitored prompts are drifting?"
//   5. Recent runs         — "what just happened in the queue?"
// =============================================================================

type Tone = "positive" | "negative" | "neutral";
type TrendPoint = { label: string; citation: number; coverage: number };

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

type OverviewSourceRow = {
  domain: string;
  type: string;
  usedShare: number;
  avgCitationsPerRun: number;
  avgQualityScore: number | undefined;
};

type OverviewKpiInput = {
  label: string;
  value: string;
  delta: string;
  tone: Tone;
};

type OverviewShape = {
  kpis?: {
    rangeDays?: number;
    totalRuns?: number;
    totalCitations?: number;
    visibility?: number;
    citationQuality?: number;
    averageCitationPosition?: number;
    runSuccessRate?: number;
    deltaVisibility?: number;
    deltaCitationQuality?: number;
  };
  trendSeries?: Array<{
    day: string;
    visibility?: number;
    citationQuality?: number;
    averagePosition?: number;
    runCount: number;
  }>;
  providerComparison?: Array<{
    provider: string;
    runCount: number;
    visibility?: number;
    citationQuality?: number;
    averagePosition?: number;
    deltaVisibility?: number;
    deltaCitationQuality?: number;
    deltaPosition?: number;
  }>;
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
  topSources?: Array<{
    domain: string;
    type: string;
    citations: number;
    share: number;
    avgQualityScore?: number;
    avgPosition?: number;
  }>;
  domainTypeBreakdown?: Array<{
    type: string;
    citations: number;
    share: number;
  }>;
  entityLeaderboard?: Array<{
    name: string;
    kind: string;
    mentionCount: number;
    responseCount: number;
    citationCount: number;
  }>;
};

export function OverviewPage({
  loading,
  hasData,
  kpis,
  trend,
  overview,
  sources,
  recentRuns,
  onOpenRun,
  onOpenPrompt,
}: {
  loading: boolean;
  hasData: boolean;
  kpis: OverviewKpiInput[];
  trend: TrendPoint[];
  overview: OverviewShape | undefined;
  sources: OverviewSourceRow[];
  recentRuns: OverviewRun[];
  onOpenRun?: (runId: string) => void;
  onOpenPrompt?: (promptId: string) => void;
}) {
  if (!loading && !hasData) {
    return (
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <div className="px-4 lg:px-6">
          <EmptyState
            title="No GEO signal captured yet"
            description="Run prompt monitoring locally to capture how AI providers cite your domains, prompts, and tracked entities."
          />
        </div>
      </div>
    );
  }

  const rangeDays = overview?.kpis?.rangeDays ?? 30;
  const lastRunAt = recentRuns[0]?.startedAt;
  const totalCitations = overview?.kpis?.totalCitations;
  const totalRuns = overview?.kpis?.totalRuns;

  return (
    <div className="flex flex-col gap-6 py-4 md:py-6">
      <div className="space-y-6 px-4 lg:px-6">
        <PageHeader
          rangeDays={rangeDays}
          lastRunAt={lastRunAt}
          totalCitations={totalCitations}
          totalRuns={totalRuns}
          loading={loading}
        />

        <HeroMetrics
          loading={loading}
          kpis={kpis}
          metrics={overview?.kpis}
          trend={overview?.trendSeries ?? []}
          fallbackTrend={trend}
        />

        <ProviderMatrix
          loading={loading}
          providers={overview?.providerComparison ?? []}
        />

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <DomainLeaderboard
            loading={loading}
            sources={overview?.topSources ?? []}
            sourcesFallback={sources}
            entities={overview?.entityLeaderboard ?? []}
          />
          <SourceMix
            loading={loading}
            breakdown={overview?.domainTypeBreakdown ?? []}
          />
        </div>

        <PromptWatchlist
          loading={loading}
          rows={overview?.promptComparison ?? []}
          onOpenPrompt={onOpenPrompt}
        />

        <RecentRunsTable
          loading={loading}
          runs={recentRuns}
          onOpenRun={onOpenRun}
        />
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// 1) Page header — editorial masthead with date stamp + at-a-glance volume
// -----------------------------------------------------------------------------

function PageHeader({
  rangeDays,
  lastRunAt,
  totalCitations,
  totalRuns,
  loading,
}: {
  rangeDays: number;
  lastRunAt: number | undefined;
  totalCitations: number | undefined;
  totalRuns: number | undefined;
  loading: boolean;
}) {
  return (
    <header className="flex flex-col gap-4 border-b border-border/60 pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-2">
        <p className="font-mono text-[10px] tracking-[0.32em] text-muted-foreground uppercase">
          GEO Pulse / Last {rangeDays} days
        </p>
        <h1 className="font-display text-4xl font-extrabold leading-[1.05] tracking-[-0.022em] text-foreground sm:text-[2.75rem]">
          How the AI engines are citing you today.
        </h1>
        <p className="text-muted-foreground text-sm max-w-xl">
          A daily snapshot of citation share, source quality, and prompt drift
          across every active provider. Drill into any signal to see the run,
          the response, and what changed.
        </p>
      </div>
      <dl className="flex shrink-0 items-end gap-6 font-mono text-[11px] tracking-[0.18em] text-muted-foreground uppercase">
        <MetaStat label="Last run" value={lastRunAt ? freshness(lastRunAt) : "-"} loading={loading} />
        <MetaStat label="Runs" value={totalRuns?.toString() ?? "-"} loading={loading} />
        <MetaStat label="Citations" value={totalCitations?.toString() ?? "-"} loading={loading} />
      </dl>
    </header>
  );
}

function MetaStat({
  label,
  value,
  loading,
}: {
  label: string;
  value: string;
  loading: boolean;
}) {
  return (
    <div className="text-right">
      <dt>{label}</dt>
      <dd className="font-display text-xl font-bold tabular-nums tracking-tight text-foreground">
        {loading ? <span className="inline-block h-5 w-10 animate-pulse rounded-sm bg-muted/60" /> : value}
      </dd>
    </div>
  );
}

// -----------------------------------------------------------------------------
// 2) Hero metrics — 4 KPI tiles with sparklines from the daily trendSeries
// -----------------------------------------------------------------------------

function HeroMetrics({
  loading,
  kpis,
  metrics,
  trend,
  fallbackTrend,
}: {
  loading: boolean;
  kpis: OverviewKpiInput[];
  metrics: OverviewShape["kpis"];
  trend: NonNullable<OverviewShape["trendSeries"]>;
  fallbackTrend: TrendPoint[];
}) {
  // Build 4 metric tiles. We prefer raw numbers from `metrics`; if those are
  // unavailable we fall back to the parent-formatted `kpis[]` strings.
  const tiles: Array<{
    label: string;
    value: string;
    sub: string;
    deltaValue: number | undefined;
    sparkSeries: number[];
    sparkAccent: "positive" | "negative" | "neutral";
    info: string;
  }> = [
    {
      label: "Visibility",
      value: pctOrFallback(metrics?.visibility, kpis[1]?.value, kpis),
      sub: deltaLabel(metrics?.deltaVisibility, "pp"),
      deltaValue: metrics?.deltaVisibility,
      sparkSeries:
        trend.length > 0
          ? trend.map((entry) => entry.visibility ?? 0)
          : fallbackTrend.map((point) => point.coverage),
      sparkAccent: deltaTone(metrics?.deltaVisibility),
      info: "Average response visibility on successful runs in this range. Higher means your tracked content is being surfaced more.",
    },
    {
      label: "Citation quality",
      value: scoreOrFallback(metrics?.citationQuality, kpis),
      sub: deltaLabel(metrics?.deltaCitationQuality, "pts"),
      deltaValue: metrics?.deltaCitationQuality,
      sparkSeries:
        trend.length > 0
          ? trend.map((entry) => entry.citationQuality ?? 0)
          : fallbackTrend.map((point) => point.citation),
      sparkAccent: deltaTone(metrics?.deltaCitationQuality),
      info: "Mean citation-quality score (0-100) across successful runs. Considers source type, position, and authority.",
    },
    {
      label: "Avg position",
      value:
        metrics?.averageCitationPosition !== undefined
          ? metrics.averageCitationPosition.toFixed(1)
          : "-",
      sub: "Lower is better",
      deltaValue: undefined,
      sparkSeries: trend.map((entry) => entry.averagePosition ?? 0),
      sparkAccent: "neutral",
      info: "Average index where your domains appear in the response's citation list. Position 1 is first.",
    },
    {
      label: "Run health",
      value:
        metrics?.runSuccessRate !== undefined
          ? `${Math.round(metrics.runSuccessRate)}%`
          : (kpis[3]?.value ?? "-"),
      sub: `${metrics?.totalRuns ?? 0} runs / ${metrics?.totalCitations ?? 0} citations`,
      deltaValue: undefined,
      sparkSeries: trend.map((entry) => entry.runCount),
      sparkAccent: "neutral",
      info: "Successful runs divided by total terminal runs in the range. Below 80% suggests blockers worth investigating.",
    },
  ];

  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {tiles.map((tile) => (
        <article
          key={tile.label}
          className="relative flex flex-col gap-3 overflow-hidden rounded-xl border border-border/70 bg-card/60 p-4 backdrop-blur-[1px]"
        >
          <header className="flex items-start justify-between gap-2">
            <p className="font-mono text-[10px] tracking-[0.28em] text-muted-foreground uppercase">
              {tile.label}
            </p>
            <InfoTooltip label={`About ${tile.label}`}>{tile.info}</InfoTooltip>
          </header>
          <div className="flex items-end justify-between gap-3">
            <p className="font-display text-[2.5rem] font-extrabold leading-none tabular-nums tracking-[-0.025em] text-foreground">
              {loading ? (
                <span className="inline-block h-10 w-24 animate-pulse rounded-md bg-muted/60" />
              ) : (
                tile.value
              )}
            </p>
            <Sparkline
              values={tile.sparkSeries}
              accent={tile.sparkAccent}
              className="h-10 w-24 shrink-0"
            />
          </div>
          <p
            className={cn(
              "font-mono text-[11px] tabular-nums tracking-wide",
              tile.deltaValue === undefined && "text-muted-foreground",
              tile.deltaValue !== undefined && tile.deltaValue > 0 && "text-positive",
              tile.deltaValue !== undefined && tile.deltaValue < 0 && "text-negative",
              tile.deltaValue === 0 && "text-muted-foreground"
            )}
          >
            {tile.sub}
          </p>
        </article>
      ))}
    </section>
  );
}

// -----------------------------------------------------------------------------
// 3) Provider matrix — side-by-side comparison row
// -----------------------------------------------------------------------------

function ProviderMatrix({
  loading,
  providers,
}: {
  loading: boolean;
  providers: NonNullable<OverviewShape["providerComparison"]>;
}) {
  if (loading) {
    return (
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="flex h-32 animate-pulse flex-col gap-3 rounded-xl border border-border/60 bg-card/40 p-4"
          />
        ))}
      </section>
    );
  }
  if (!providers.length) {
    return (
      <section>
        <SectionLabel>Provider matrix</SectionLabel>
        <InlineEmpty text="No active providers have completed runs in this range." />
      </section>
    );
  }
  return (
    <section className="space-y-3">
      <SectionLabel>Provider matrix</SectionLabel>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {providers.map((p) => (
          <article
            key={p.provider}
            className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card/60 p-4"
          >
            <header className="flex items-center justify-between gap-2">
              <h3 className="font-display text-lg font-bold leading-tight tracking-tight text-foreground">
                {p.provider}
              </h3>
              <Badge variant="outline" className="font-mono text-[10px] tracking-wider">
                {p.runCount} run{p.runCount === 1 ? "" : "s"}
              </Badge>
            </header>
            <dl className="grid grid-cols-3 gap-2 text-left">
              <ProviderStat
                label="Vis."
                value={p.visibility !== undefined ? `${Math.round(p.visibility)}%` : "-"}
                delta={p.deltaVisibility}
                deltaUnit="pp"
              />
              <ProviderStat
                label="Quality"
                value={p.citationQuality !== undefined ? Math.round(p.citationQuality).toString() : "-"}
                delta={p.deltaCitationQuality}
                deltaUnit="pts"
              />
              <ProviderStat
                label="Pos."
                value={p.averagePosition !== undefined ? p.averagePosition.toFixed(1) : "-"}
                delta={p.deltaPosition !== undefined ? -p.deltaPosition : undefined}
                deltaUnit=""
              />
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}

function ProviderStat({
  label,
  value,
  delta,
  deltaUnit,
}: {
  label: string;
  value: string;
  delta: number | undefined;
  deltaUnit: string;
}) {
  return (
    <div className="space-y-1">
      <dt className="font-mono text-[10px] tracking-[0.24em] text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="font-display text-xl font-bold tabular-nums tracking-tight text-foreground">
        {value}
      </dd>
      <p
        className={cn(
          "font-mono text-[10px] tabular-nums tracking-wide",
          delta === undefined && "text-muted-foreground/60",
          delta !== undefined && delta > 0 && "text-positive",
          delta !== undefined && delta < 0 && "text-negative",
          delta === 0 && "text-muted-foreground"
        )}
      >
        {delta === undefined ? "·" : `${delta > 0 ? "+" : ""}${delta.toFixed(deltaUnit ? 1 : 2)}${deltaUnit}`}
      </p>
    </div>
  );
}

// -----------------------------------------------------------------------------
// 4a) Domain leaderboard — top citing domains as a bar chart
// -----------------------------------------------------------------------------

function DomainLeaderboard({
  loading,
  sources,
  sourcesFallback,
  entities,
}: {
  loading: boolean;
  sources: NonNullable<OverviewShape["topSources"]>;
  sourcesFallback: OverviewSourceRow[];
  entities: NonNullable<OverviewShape["entityLeaderboard"]>;
}) {
  // Use the rich Convex shape if available, otherwise fall back to the simpler
  // sources query the parent already passes (covers the loading / empty edges).
  const rows = (sources.length
    ? sources.map((source) => ({
        domain: source.domain,
        type: source.type,
        share: source.share,
        citations: source.citations,
        avgQuality: source.avgQualityScore,
        avgPosition: source.avgPosition,
      }))
    : sourcesFallback.map((source) => ({
        domain: source.domain,
        type: source.type,
        share: source.usedShare,
        citations: source.avgCitationsPerRun,
        avgQuality: source.avgQualityScore,
        avgPosition: undefined,
      }))
  ).slice(0, 8);

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <SectionLabel>Top citing domains</SectionLabel>
        <p className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
          Share of citations
        </p>
      </div>
      <article className="rounded-xl border border-border/70 bg-card/60">
        {loading ? (
          <div className="flex flex-col gap-3 p-4">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="flex animate-pulse items-center gap-3">
                <div className="h-4 w-32 rounded-sm bg-muted/60" />
                <div className="h-4 flex-1 rounded-sm bg-muted/40" />
                <div className="h-4 w-12 rounded-sm bg-muted/60" />
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="p-4">
            <InlineEmpty text="No citations captured in this range yet." />
          </div>
        ) : (
          <ul className="divide-y divide-border/40">
            {rows.map((row, index) => (
              <li key={`${row.domain}-${index}`} className="flex items-center gap-4 px-4 py-3">
                <span className="font-mono text-[11px] tabular-nums text-muted-foreground w-6">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="truncate font-medium text-sm text-foreground">{row.domain}</p>
                  <p className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
                    {row.type}
                    {typeof row.avgQuality === "number" ? (
                      <span className="ml-2 normal-case tracking-normal text-muted-foreground/80">
                        Q {Math.round(row.avgQuality)}
                      </span>
                    ) : null}
                    {typeof row.avgPosition === "number" ? (
                      <span className="ml-2 normal-case tracking-normal text-muted-foreground/80">
                        Pos {row.avgPosition.toFixed(1)}
                      </span>
                    ) : null}
                  </p>
                </div>
                <div className="hidden sm:block w-32">
                  <ShareBar share={row.share ?? 0} />
                </div>
                <p className="font-display text-base font-bold tabular-nums tracking-tight text-foreground w-12 text-right">
                  {row.share !== undefined ? `${Math.round(row.share)}%` : "-"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </article>

      {entities.length > 0 ? (
        <div className="rounded-xl border border-border/70 bg-card/40 p-4">
          <p className="font-mono text-[10px] tracking-[0.28em] text-muted-foreground uppercase mb-3">
            Tracked entities mentioned
          </p>
          <ul className="flex flex-wrap gap-2">
            {entities.slice(0, 8).map((entity) => (
              <li
                key={entity.name}
                className="flex items-center gap-2 rounded-md border border-border/60 bg-background/40 px-2.5 py-1.5"
              >
                <span className="font-medium text-sm text-foreground">{entity.name}</span>
                <span className="font-mono text-[10px] tabular-nums tracking-wider text-muted-foreground">
                  {entity.mentionCount}× / {entity.responseCount} runs
                </span>
                <Badge variant="secondary" className="font-mono text-[9px] uppercase tracking-widest">
                  {entity.kind}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function ShareBar({ share }: { share: number }) {
  const clamped = Math.max(0, Math.min(100, share));
  return (
    <div
      className="relative h-2 w-full overflow-hidden rounded-full bg-muted/40"
      role="presentation"
    >
      <div
        className="absolute inset-y-0 left-0 rounded-full bg-foreground/80"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

// -----------------------------------------------------------------------------
// 4b) Source mix — domain-type breakdown stacked bar
// -----------------------------------------------------------------------------

function SourceMix({
  loading,
  breakdown,
}: {
  loading: boolean;
  breakdown: NonNullable<OverviewShape["domainTypeBreakdown"]>;
}) {
  const total = breakdown.reduce((sum, item) => sum + item.citations, 0);

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <SectionLabel>Source mix</SectionLabel>
        <p className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
          By type
        </p>
      </div>
      <article className="rounded-xl border border-border/70 bg-card/60 p-4">
        {loading ? (
          <div className="space-y-3">
            <div className="h-6 w-full animate-pulse rounded-md bg-muted/40" />
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="flex animate-pulse items-center gap-3">
                <div className="h-3 w-3 rounded-sm bg-muted/60" />
                <div className="h-4 flex-1 rounded-sm bg-muted/40" />
                <div className="h-4 w-10 rounded-sm bg-muted/60" />
              </div>
            ))}
          </div>
        ) : breakdown.length === 0 ? (
          <InlineEmpty text="No source-type data yet." />
        ) : (
          <div className="space-y-4">
            <div className="flex h-3 w-full overflow-hidden rounded-full border border-border/50 bg-muted/20">
              {breakdown.map((item, index) => (
                <span
                  key={item.type}
                  title={`${item.type} — ${Math.round(item.share)}%`}
                  className="h-full"
                  style={{
                    width: `${total ? (item.citations / total) * 100 : 0}%`,
                    backgroundColor: typeColor(item.type, index),
                  }}
                />
              ))}
            </div>
            <ul className="space-y-2">
              {breakdown.map((item, index) => (
                <li
                  key={item.type}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-sm"
                      style={{ backgroundColor: typeColor(item.type, index) }}
                    />
                    <span className="font-medium capitalize text-foreground truncate">
                      {item.type}
                    </span>
                  </span>
                  <span className="font-mono text-[11px] tabular-nums tracking-wider text-muted-foreground">
                    {item.citations} · {Math.round(item.share)}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </article>
    </section>
  );
}

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

// -----------------------------------------------------------------------------
// 5) Prompt watchlist — top monitored prompts with drift / status signals
// -----------------------------------------------------------------------------

function PromptWatchlist({
  loading,
  rows,
  onOpenPrompt,
}: {
  loading: boolean;
  rows: OverviewShape["promptComparison"];
  onOpenPrompt?: (promptId: string) => void;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <SectionLabel>Prompt watchlist</SectionLabel>
        <p className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
          Drift = response variance across runs
        </p>
      </div>
      <article className="overflow-hidden rounded-xl border border-border/70 bg-card/60">
        {loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-12 animate-pulse rounded-md bg-muted/40" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="p-4">
            <InlineEmpty text="No prompt comparisons yet — queue some runs from the Prompts page." />
          </div>
        ) : (
          <ul className="divide-y divide-border/40">
            {rows.map((row) => {
              const open = onOpenPrompt
                ? () => onOpenPrompt(row.promptId)
                : undefined;
              const driftPct =
                typeof row.responseDrift === "number"
                  ? Math.round(row.responseDrift)
                  : undefined;
              const driftTone =
                driftPct === undefined
                  ? "neutral"
                  : driftPct >= 50
                    ? "negative"
                    : driftPct >= 25
                      ? "neutral"
                      : "positive";

              return (
                <li
                  key={row.promptId}
                  role={open ? "button" : undefined}
                  tabIndex={open ? 0 : undefined}
                  aria-label={open ? `Open prompt detail for ${row.excerpt}` : undefined}
                  onClick={open}
                  onKeyDown={(event) => {
                    if (open && (event.key === "Enter" || event.key === " ")) {
                      event.preventDefault();
                      open();
                    }
                  }}
                  className={cn(
                    "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto]",
                    open && "cursor-pointer transition-colors hover:bg-foreground/5 focus:outline-none focus-visible:bg-foreground/5"
                  )}
                >
                  <div className="min-w-0 space-y-1">
                    <p className="line-clamp-2 font-medium text-sm text-foreground">
                      {row.excerpt}
                    </p>
                    <p className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
                      {row.providerName} · {row.responseCount} run
                      {row.responseCount === 1 ? "" : "s"} ·{" "}
                      <span className="normal-case tracking-normal">
                        {row.sourceDiversity} unique source
                        {row.sourceDiversity === 1 ? "" : "s"}
                      </span>
                      {row.topEntity ? (
                        <span className="ml-2 normal-case tracking-normal">
                          mentions <span className="text-foreground/80">{row.topEntity}</span>
                        </span>
                      ) : null}
                    </p>
                  </div>
                  <StatusPill status={row.latestStatus} />
                  <div className="hidden sm:block text-right">
                    <p
                      className={cn(
                        "font-display text-lg font-bold tabular-nums tracking-tight",
                        driftTone === "positive" && "text-positive",
                        driftTone === "negative" && "text-negative",
                        driftTone === "neutral" && "text-foreground"
                      )}
                    >
                      {driftPct !== undefined ? `${driftPct}%` : "-"}
                    </p>
                    <p className="font-mono text-[9px] tracking-[0.2em] text-muted-foreground uppercase">
                      Drift
                    </p>
                  </div>
                  <span className="hidden sm:inline-block font-mono text-muted-foreground/60">
                    →
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </article>
    </section>
  );
}

// -----------------------------------------------------------------------------
// 6) Recent runs — the live tail
// -----------------------------------------------------------------------------

function RecentRunsTable({
  loading,
  runs,
  onOpenRun,
}: {
  loading: boolean;
  runs: OverviewRun[];
  onOpenRun?: (runId: string) => void;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <SectionLabel>Live tail</SectionLabel>
        <p className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
          Most recent runs
        </p>
      </div>
      <article className="overflow-hidden rounded-xl border border-border/70 bg-card/60">
        {loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-12 animate-pulse rounded-md bg-muted/40" />
            ))}
          </div>
        ) : runs.length === 0 ? (
          <div className="p-4">
            <InlineEmpty text="Nothing has run yet." />
          </div>
        ) : (
          <ul className="divide-y divide-border/40">
            {runs.slice(0, 8).map((run) => {
              const open = onOpenRun ? () => onOpenRun(run.id) : undefined;
              return (
                <li
                  key={run.id}
                  role={open ? "button" : undefined}
                  tabIndex={open ? 0 : undefined}
                  aria-label={
                    open
                      ? `Open run for ${run.promptExcerpt}, started ${freshness(run.startedAt)}`
                      : undefined
                  }
                  onClick={open}
                  onKeyDown={(event) => {
                    if (open && (event.key === "Enter" || event.key === " ")) {
                      event.preventDefault();
                      open();
                    }
                  }}
                  className={cn(
                    "grid grid-cols-[1fr_auto] items-center gap-4 px-4 py-3 sm:grid-cols-[120px_minmax(0,1fr)_auto_auto_auto]",
                    open && "cursor-pointer transition-colors hover:bg-foreground/5 focus:outline-none focus-visible:bg-foreground/5"
                  )}
                >
                  <div className="space-y-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="font-medium text-sm text-foreground decoration-dotted underline-offset-4 hover:underline">
                          {freshness(run.startedAt)}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>{exactTimestamp(run.startedAt)}</TooltipContent>
                    </Tooltip>
                    <p className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
                      {run.providerName}
                    </p>
                  </div>
                  <p className="hidden sm:block truncate font-medium text-sm text-foreground">
                    {run.promptExcerpt}
                  </p>
                  <StatusPill status={run.status} />
                  <p className="hidden sm:block font-mono text-[11px] tabular-nums tracking-wider text-muted-foreground">
                    {formatRuntime(run)}
                  </p>
                  <p className="font-mono text-[11px] tabular-nums tracking-wider text-muted-foreground">
                    {run.sourceCount ?? run.citationCount} src
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </article>
    </section>
  );
}

// -----------------------------------------------------------------------------
// Shared primitives
// -----------------------------------------------------------------------------

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="font-mono text-[11px] tracking-[0.32em] text-muted-foreground uppercase">
      {children}
    </h2>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    success: {
      label: "Success",
      className: "border-positive/40 text-positive bg-positive/10",
    },
    failed: {
      label: "Failed",
      className: "border-negative/40 text-negative bg-negative/10",
    },
    blocked: {
      label: "Blocked",
      className: "border-negative/40 text-negative bg-negative/10",
    },
    running: {
      label: "Running",
      className: "border-primary/40 text-primary bg-primary/10",
    },
    queued: {
      label: "Queued",
      className: "border-highlight/50 text-highlight-foreground bg-highlight/15",
    },
  };
  const meta = map[status] ?? {
    label: titleCase(status),
    className: "border-border/60 text-muted-foreground bg-muted/30",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em]",
        meta.className
      )}
    >
      {meta.label}
    </span>
  );
}

function Sparkline({
  values,
  accent,
  className,
}: {
  values: number[];
  accent: "positive" | "negative" | "neutral";
  className?: string;
}) {
  const series = values.filter((value) => Number.isFinite(value));
  if (series.length === 0) {
    return <div className={cn("opacity-30", className)} aria-hidden />;
  }
  const max = Math.max(...series);
  const min = Math.min(...series);
  const range = max - min || 1;
  const width = 100;
  const height = 32;
  const step = series.length === 1 ? width : width / (series.length - 1);
  const points = series
    .map((value, index) => {
      const x = index * step;
      const y = height - ((value - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const stroke =
    accent === "positive"
      ? "var(--positive)"
      : accent === "negative"
        ? "var(--negative)"
        : "var(--muted-foreground)";

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={cn("text-foreground/40", className)}
      aria-hidden
    >
      <polyline
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
      <circle
        cx={(series.length - 1) * step}
        cy={height - ((series[series.length - 1] - min) / range) * height}
        r={1.75}
        fill={stroke}
      />
    </svg>
  );
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function pctOrFallback(
  rawValue: number | undefined,
  fallback: string | undefined,
  _kpis: OverviewKpiInput[]
): string {
  if (typeof rawValue === "number") return `${Math.round(rawValue)}%`;
  return fallback ?? "-";
}

function scoreOrFallback(rawValue: number | undefined, kpis: OverviewKpiInput[]): string {
  if (typeof rawValue === "number") return Math.round(rawValue).toString();
  // The parent formats this as "82 / 100" — strip the suffix so the hero number
  // reads cleanly; the "/ 100" implication lives in the metric label.
  const fallback = kpis[2]?.value ?? "-";
  return fallback.replace(/\s*\/\s*100$/, "");
}

function deltaTone(value: number | undefined): "positive" | "negative" | "neutral" {
  if (value === undefined || value === 0) return "neutral";
  return value > 0 ? "positive" : "negative";
}

function deltaLabel(value: number | undefined, unit: string): string {
  if (value === undefined) return "No prior period to compare";
  if (value === 0) return `Flat vs prior period`;
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}${unit} vs prior period`;
}

function freshness(timestamp: number) {
  const minutes = Math.max(1, Math.round((Date.now() - timestamp) / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function exactTimestamp(timestamp: number) {
  return new Date(timestamp).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getRuntimeMs(
  run: Pick<OverviewRun, "latencyMs" | "startedAt" | "finishedAt">
) {
  if (typeof run.latencyMs === "number") return run.latencyMs;
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

function titleCase(value: string) {
  return value
    .split("_")
    .map((item) => item.charAt(0).toUpperCase() + item.slice(1).toLowerCase())
    .join(" ");
}
