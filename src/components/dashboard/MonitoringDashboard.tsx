import { useDeferredValue, useMemo, useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";

import type { Id } from "../../../convex/_generated/dataModel";
import { api } from "../../../convex/_generated/api";

import { AppSidebar } from "@/components/layout/AppSidebar";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

import { StatusBanner } from "./components/StatusBanner";
import { ProductTour } from "./components/ProductTour";
import { OverviewPage } from "./OverviewPage";
import { PromptsPage } from "./PromptsPage";
import { SourcesPage } from "./SourcesPage";
import { ModelsPage } from "./ModelsPage";
import { SettingsPage } from "./SettingsPage";

type PageKey = "overview" | "prompts" | "sources" | "models" | "settings";
type Tone = "positive" | "negative" | "neutral";
type TrackedKind = "brand" | "competitor" | "product" | "feature" | "other";

export function MonitoringDashboard() {
  const [page, setPage] = useState<PageKey>("overview");
  const [rangeDays, setRangeDays] = useState(7);
  const [modelFilter, setModelFilter] = useState("all");
  const [promptSearch, setPromptSearch] = useState("");
  const [selectedGroup, setSelectedGroup] = useState<
    Id<"promptGroups"> | "all"
  >("all");
  const [selectedRunId, setSelectedRunId] = useState<Id<"promptRuns"> | null>(
    null
  );
  const [notice, setNotice] = useState("");
  const [tourOpen, setTourOpen] = useState(false);
  const search = useDeferredValue(promptSearch.trim().toLowerCase());

  const [newGroupName, setNewGroupName] = useState("");
  const [newPromptName, setNewPromptName] = useState("");
  const [newPromptText, setNewPromptText] = useState("");
  const [newPromptModel, setNewPromptModel] = useState("gpt-5");
  const [newPromptGroup, setNewPromptGroup] = useState<
    Id<"promptGroups"> | "none"
  >("none");
  const [newEntityName, setNewEntityName] = useState("");
  const [newEntityKind, setNewEntityKind] = useState<TrackedKind>("brand");
  const [newEntityDomain, setNewEntityDomain] = useState("");

  const { isAuthenticated } = useConvexAuth();
  const live = isAuthenticated;
  const model = modelFilter === "all" ? undefined : modelFilter;
  const promptArgs =
    selectedGroup === "all" ? {} : { groupId: selectedGroup };

  const overview = useQuery(
    api.analytics.getOverview,
    live ? { rangeDays, model } : "skip"
  );
  const promptGroups = useQuery(
    api.analytics.listPromptGroups,
    live ? {} : "skip"
  );
  const prompts = useQuery(
    api.analytics.listPrompts,
    live ? promptArgs : "skip"
  );
  const promptJobs = useQuery(
    api.analytics.listPromptJobs,
    live ? {} : "skip"
  );
  const runs = useQuery(
    api.analytics.listPromptRuns,
    live ? { limit: 200, model } : "skip"
  );
  const sources = useQuery(
    api.analytics.listSources,
    live ? { rangeDays, model, limit: 80 } : "skip"
  );
  const entities =
    useQuery(api.analytics.listTrackedEntities, live ? {} : "skip") ?? [];
  const runDetail = useQuery(
    api.analytics.getPromptRun,
    live && selectedRunId ? { id: selectedRunId } : "skip"
  );

  const createPromptGroup = useMutation(api.analytics.createPromptGroup);
  const updatePromptGroup = useMutation(api.analytics.updatePromptGroup);
  const deletePromptGroup = useMutation(api.analytics.deletePromptGroup);
  const createPrompt = useMutation(api.analytics.createPrompt);
  const updatePrompt = useMutation(api.analytics.updatePrompt);
  const deletePrompt = useMutation(api.analytics.deletePrompt);
  const createPromptJob = useMutation(api.analytics.createPromptJob);
  const updatePromptJob = useMutation(api.analytics.updatePromptJob);
  const deletePromptJob = useMutation(api.analytics.deletePromptJob);
  const triggerSelectedPromptsNow = useMutation(
    api.analytics.triggerSelectedPromptsNow
  );
  const triggerPromptJobNow = useMutation(api.analytics.triggerPromptJobNow);
  const createTrackedEntity = useMutation(api.analytics.createTrackedEntity);
  const updateTrackedEntity = useMutation(api.analytics.updateTrackedEntity);
  const deleteTrackedEntity = useMutation(api.analytics.deleteTrackedEntity);

  const loading =
    live &&
    (overview === undefined ||
      prompts === undefined ||
      promptJobs === undefined ||
      runs === undefined ||
      sources === undefined);
  const hasData = !!overview && overview.kpis.totalRuns > 0;

  const rollups = useMemo(
    () => buildPromptRollups(runs ?? []),
    [runs]
  );
  const promptRows = useMemo(() => {
    const list = prompts ?? [];
    return list
      .map((prompt) => {
        const row = rollups.get(String(prompt._id));
        const group = (promptGroups ?? []).find(
          (item) => item._id === prompt.groupId
        );
        return {
          id: prompt._id,
          name: prompt.name,
          group: group?.name ?? "Ungrouped",
          model: prompt.targetModel,
          visibility: row?.visibility,
          citation: row?.citation,
          latestRunAt: row?.latestRunAt,
          latestRunId: row?.latestRunId,
          active: prompt.active,
        };
      })
      .filter(
        (row) =>
          !search ||
          `${row.name} ${row.group} ${row.model}`
            .toLowerCase()
            .includes(search)
      );
  }, [promptGroups, prompts, rollups, search]);

  const trend = useMemo(() => {
    if (!overview) return [];
    return overview.trendSeries.map((item) => ({
      label: formatDay(item.day),
      visibility: item.visibility ?? 0,
      citation: item.citationQuality ?? 0,
      coverage: clamp(
        (item.runCount / Math.max(overview.kpis.totalRuns, 1)) * 100,
        0,
        100
      ),
    }));
  }, [overview]);

  const modelRows = useMemo(
    () => mapModelRows(overview?.modelComparison ?? [], runs ?? []),
    [overview?.modelComparison, runs]
  );
  const kpis = useMemo(
    () => mapKpis(overview, sources?.meta.totalDomains),
    [overview, sources?.meta.totalDomains]
  );

  const openSettings = async () => {
    setPage("settings");
  };

  const refreshAnalytics = () => {
    window.location.reload();
  };

  return (
    <TooltipProvider>
      <SidebarProvider
        style={
          {
            "--sidebar-width": "16rem",
          } as React.CSSProperties
        }
      >
        <AppSidebar page={page} onPage={setPage} />
        <SidebarInset>
          <SiteHeader
            rangeDays={rangeDays}
            onRangeDays={setRangeDays}
            modelFilter={modelFilter}
            onModelFilter={setModelFilter}
            onRefresh={refreshAnalytics}
            onStartTutorial={() => setTourOpen(true)}
          />

          <div className="flex flex-1 flex-col">
            {/* Notices */}
            {(!live || loading || notice) && (
              <div className="flex flex-col gap-2 px-4 pt-4 lg:px-6">
                {!live && (
                  <StatusBanner text="Sign in to load analytics data." />
                )}
                {loading && (
                  <StatusBanner text="Loading analytics data..." />
                )}
                {notice && <StatusBanner text={notice} />}
              </div>
            )}

            {/* Page content */}
            {page === "overview" && (
              <OverviewPage
                loading={loading}
                hasData={hasData}
                kpis={kpis}
                trend={trend}
                overview={overview}
                sources={sources?.items ?? []}
                sourceMix={sources?.domainTypeBreakdown ?? []}
                onOpenSettings={openSettings}
              />
            )}
            {page === "prompts" && (
              <PromptsPage
                groups={promptGroups ?? []}
                selectedGroup={selectedGroup}
                onSelectGroup={setSelectedGroup}
                rows={promptRows}
                promptJobs={promptJobs ?? []}
                search={promptSearch}
                onSearch={setPromptSearch}
                runDetail={runDetail}
                selectedRunId={selectedRunId}
                onSelectRun={setSelectedRunId}
                newGroupName={newGroupName}
                onNewGroupName={setNewGroupName}
                newPromptName={newPromptName}
                onNewPromptName={setNewPromptName}
                newPromptText={newPromptText}
                onNewPromptText={setNewPromptText}
                newPromptModel={newPromptModel}
                onNewPromptModel={setNewPromptModel}
                newPromptGroup={newPromptGroup}
                onNewPromptGroup={setNewPromptGroup}
                onCreateGroup={createPromptGroup}
                onUpdateGroup={updatePromptGroup}
                onDeleteGroup={deletePromptGroup}
                onCreatePrompt={createPrompt}
                onUpdatePrompt={updatePrompt}
                onDeletePrompt={deletePrompt}
                onCreatePromptJob={createPromptJob}
                onUpdatePromptJob={updatePromptJob}
                onDeletePromptJob={deletePromptJob}
                onTriggerSelectedNow={triggerSelectedPromptsNow}
                onTriggerPromptJobNow={triggerPromptJobNow}
                onNotice={setNotice}
              />
            )}
            {page === "sources" && (
              <SourcesPage
                sources={sources?.items ?? []}
                entities={entities}
                newEntityName={newEntityName}
                onNewEntityName={setNewEntityName}
                newEntityKind={newEntityKind}
                onNewEntityKind={setNewEntityKind}
                newEntityDomain={newEntityDomain}
                onNewEntityDomain={setNewEntityDomain}
                onCreateEntity={createTrackedEntity}
                onUpdateEntity={updateTrackedEntity}
                onDeleteEntity={deleteTrackedEntity}
                onNotice={setNotice}
              />
            )}
            {page === "models" && (
              <ModelsPage rows={modelRows} onOpenSettings={openSettings} />
            )}
            {page === "settings" && (
              <SettingsPage />
            )}
          </div>
        </SidebarInset>

        <ProductTour
          open={tourOpen}
          onClose={() => setTourOpen(false)}
          onNavigate={setPage}
        />
      </SidebarProvider>
    </TooltipProvider>
  );
}

/* ─── helpers ─── */

function buildPromptRollups(
  runs: Array<{
    _id: Id<"promptRuns">;
    promptId: Id<"prompts">;
    startedAt: number;
    visibilityScore?: number;
    citationQualityScore?: number;
  }>
) {
  const map = new Map<
    string,
    {
      visibility?: number;
      citation?: number;
      latestRunAt?: number;
      latestRunId?: Id<"promptRuns">;
    }
  >();
  for (const run of runs) {
    const key = String(run.promptId);
    const current = map.get(key) ?? {};
    const vis =
      current.visibility !== undefined ? [current.visibility] : [];
    const cit =
      current.citation !== undefined ? [current.citation] : [];
    if (typeof run.visibilityScore === "number")
      vis.push(run.visibilityScore);
    if (typeof run.citationQualityScore === "number")
      cit.push(run.citationQualityScore);
    map.set(key, {
      visibility: average(vis),
      citation: average(cit),
      latestRunAt: Math.max(current.latestRunAt ?? 0, run.startedAt),
      latestRunId:
        current.latestRunAt !== undefined &&
        current.latestRunAt > run.startedAt
          ? current.latestRunId
          : run._id,
    });
  }
  return map;
}

function mapModelRows(
  comparison: Array<{
    model: string;
    visibility?: number;
    citationQuality?: number;
    averagePosition?: number;
  }>,
  runs: Array<{ model: string; status: string }>
) {
  const health = new Map<string, { total: number; success: number }>();
  for (const run of runs) {
    const entry = health.get(run.model) ?? { total: 0, success: 0 };
    entry.total += 1;
    if (run.status === "success") entry.success += 1;
    health.set(run.model, entry);
  }
  return comparison.map((item) => {
    const stats = health.get(item.model);
    return {
      model: item.model,
      visibility: item.visibility,
      citation: item.citationQuality,
      position: item.averagePosition,
      runSuccess:
        stats && stats.total
          ? (stats.success / stats.total) * 100
          : undefined,
    };
  });
}

type Kpi = { label: string; value: string; delta: string; tone: Tone };

function mapKpis(
  overview:
    | {
        kpis: {
          visibility?: number;
          citationQuality?: number;
          deltaVisibility?: number;
          deltaCitationQuality?: number;
          runSuccessRate?: number;
          totalCitations: number;
        };
        recentRuns: Array<{ startedAt: number }>;
      }
    | undefined,
  totalDomains: number | undefined
): Kpi[] {
  if (!overview) return [];
  return [
    {
      label: "Visibility",
      value: formatPercent(overview.kpis.visibility),
      delta: formatDelta(overview.kpis.deltaVisibility),
      tone: trendTone(overview.kpis.deltaVisibility),
    },
    {
      label: "Citation quality",
      value:
        overview.kpis.citationQuality !== undefined
          ? `${Math.round(overview.kpis.citationQuality)} / 100`
          : "-",
      delta: formatDelta(overview.kpis.deltaCitationQuality),
      tone: trendTone(overview.kpis.deltaCitationQuality),
    },
    {
      label: "Source coverage",
      value: `${totalDomains ?? 0} domains`,
      delta: `${overview.kpis.totalCitations} citations`,
      tone: "neutral" as Tone,
    },
    {
      label: "Run health",
      value: formatPercent(overview.kpis.runSuccessRate),
      delta: overview.recentRuns[0]
        ? formatFreshness(overview.recentRuns[0].startedAt)
        : "No recent run",
      tone:
        overview.kpis.runSuccessRate !== undefined &&
        overview.kpis.runSuccessRate >= 90
          ? "positive"
          : "negative",
    },
  ];
}

function average(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatPercent(value: number | undefined): string {
  if (value === undefined) return "-";
  return `${Math.round(value)}%`;
}

function formatDelta(value: number | undefined): string {
  if (value === undefined) return "No baseline";
  if (Math.abs(value) < 0.1) return "Flat";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}`;
}

function trendTone(value: number | undefined): Tone {
  if (value === undefined || Math.abs(value) < 0.1) return "neutral";
  return value > 0 ? "positive" : "negative";
}

function formatDay(key: string): string {
  const date = new Date(key);
  if (Number.isNaN(date.getTime())) return key;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatFreshness(timestamp: number): string {
  const minutes = Math.max(1, Math.round((Date.now() - timestamp) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
