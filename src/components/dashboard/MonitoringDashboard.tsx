import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";

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
import { PromptDetailPage } from "./PromptDetailPage";
import { ResponseDetailPage } from "./ResponseDetailPage";
import { SourcesPage } from "./SourcesPage";
import { ModelsPage } from "./ModelsPage";

type PageKey = "overview" | "prompts" | "sources" | "models";
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

  const model = modelFilter === "all" ? undefined : modelFilter;
  const overview = useQuery(api.analytics.getOverview, { rangeDays, model });
  const promptGroups = useQuery(api.analytics.listPromptGroups, {});
  const promptAnalytics = useQuery(api.analytics.listPromptResponseAnalytics, {
    groupId: selectedGroup === "all" ? undefined : selectedGroup,
    model,
    rangeDays,
  });
  const promptJobs = useQuery(api.analytics.listPromptJobs, {});
  const queueStatus = useQuery(api.analytics.getQueueStatus, {});
  const runs = useQuery(api.analytics.listPromptRuns, { limit: 200, model });
  const [selectedPromptId, setSelectedPromptId] = useState<Id<"prompts"> | null>(
    null
  );
  const sources = useQuery(api.analytics.listSources, { rangeDays, model, limit: 80 });
  const promptAnalysis = useQuery(
    api.analytics.getPromptAnalysis,
    selectedPromptId ? { promptId: selectedPromptId, model, rangeDays } : "skip"
  );
  const entities = useQuery(api.analytics.listTrackedEntities, {}) ?? [];
  const runDetail = useQuery(
    api.analytics.getPromptRun,
    selectedRunId ? { id: selectedRunId } : "skip"
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
    overview === undefined ||
    promptAnalytics === undefined ||
    promptJobs === undefined ||
    queueStatus === undefined ||
    runs === undefined ||
    sources === undefined;
  const hasData = !!overview && overview.kpis.totalRuns > 0;

  const promptRows = useMemo(
    () =>
      (promptAnalytics ?? []).filter(
        (row) =>
          !search ||
          `${row.name} ${row.group} ${row.model} ${row.latestResponseSummary ?? ""} ${(row.topEntities ?? []).join(" ")} ${(row.topSources ?? []).join(" ")}`
            .toLowerCase()
            .includes(search)
      ),
    [promptAnalytics, search]
  );

  useEffect(() => {
    if (!promptRows.length) {
      setSelectedPromptId(null);
      setSelectedRunId(null);
      return;
    }
    if (selectedPromptId && promptRows.some((row) => row.id === selectedPromptId)) {
      return;
    }
    setSelectedPromptId(null);
    setSelectedRunId(null);
  }, [promptRows, selectedPromptId]);

  const queueSummary = useMemo(() => {
    return {
      queuedCount: queueStatus?.queuedCount ?? 0,
      runningCount: queueStatus?.runningCount ?? 0,
      latestCompletedAt:
        queueStatus?.latestFinishedRun?.finishedAt ??
        queueStatus?.latestFinishedRun?.startedAt,
    };
  }, [queueStatus]);

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
  const selectedGroupName = useMemo(() => {
    if (selectedGroup === "all") return "All prompts";
    return (promptGroups ?? []).find((group) => group._id === selectedGroup)?.name;
  }, [promptGroups, selectedGroup]);

  const refreshAnalytics = () => {
    window.location.reload();
  };

  const openPrompt = (promptId: Id<"prompts"> | null) => {
    setSelectedPromptId(promptId);
    setSelectedRunId(null);
  };

  const openRun = (runId: Id<"promptRuns"> | null) => {
    setSelectedRunId(runId);
  };

  const promptView = selectedRunId
    ? "response"
    : selectedPromptId
      ? "prompt"
      : "list";
  const breadcrumbs = (() => {
    if (page !== "prompts") {
      return [{ label: page.charAt(0).toUpperCase() + page.slice(1) }];
    }

    const items: Array<{ label: string; onClick?: () => void }> = [
      { label: "Prompts", onClick: promptView !== "list" ? () => openPrompt(null) : undefined },
    ];

    if (promptView !== "list" && promptAnalysis?.prompt.name) {
      items.push({
        label: promptAnalysis.prompt.name,
        onClick: promptView === "response" ? () => openRun(null) : undefined,
      });
    }

    if (promptView === "response") {
      items.push({ label: "Response Detail" });
    }

    return items;
  })();

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
            breadcrumbs={breadcrumbs}
          />

          <div className="flex flex-1 flex-col">
            {/* Notices */}
            {(loading || notice) && (
              <div className="flex flex-col gap-2 px-4 pt-4 lg:px-6">
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
              />
            )}
            {page === "prompts" && (
              <>
                {promptView === "list" && (
                  <PromptsPage
                    groups={promptGroups ?? []}
                    selectedGroup={selectedGroup}
                    onSelectGroup={setSelectedGroup}
                    rows={promptRows}
                    selectedPromptId={selectedPromptId}
                    onSelectPrompt={openPrompt}
                    promptJobs={promptJobs ?? []}
                    queueSummary={queueSummary}
                    search={promptSearch}
                    onSearch={setPromptSearch}
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
                {promptView === "prompt" && (
                  <PromptDetailPage
                    selectedGroupName={selectedGroupName}
                    promptAnalysis={promptAnalysis}
                    onBack={() => openPrompt(null)}
                    selectedRunId={selectedRunId}
                    onOpenRun={(runId) => openRun(runId)}
                  />
                )}
                {promptView === "response" && (
                  <ResponseDetailPage
                    runDetail={runDetail}
                    onBack={() => openRun(null)}
                  />
                )}
              </>
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
              <ModelsPage rows={modelRows} />
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
