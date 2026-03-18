import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";

import type { Id } from "../../../convex/_generated/dataModel";
import { api } from "../../../convex/_generated/api";

import { AppSidebar } from "@/components/layout/AppSidebar";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

import { StatusBanner } from "./components/StatusBanner";
import { OverviewPage } from "./OverviewPage";
import { PromptsPage } from "./PromptsPage";
import { PromptDetailPage } from "./PromptDetailPage";
import { ResponseDetailPage } from "./ResponseDetailPage";
import { RunsPage } from "./RunsPage";
import { GroupsPage } from "./GroupsPage";
import { ResponsesPage } from "./ResponsesPage";
import { SourcesPage } from "./SourcesPage";

type PageKey =
  | "overview"
  | "prompts"
  | "runs"
  | "groups"
  | "responses"
  | "sources";
type Tone = "positive" | "negative" | "neutral";
type TrackedKind = "brand" | "competitor" | "product" | "feature" | "other";
type RunDetailContext = "prompts" | "runs" | "responses" | null;

export function MonitoringDashboard() {
  const [page, setPage] = useState<PageKey>("overview");
  const [rangeDays, setRangeDays] = useState(7);
  const [modelFilter, setModelFilter] = useState("all");
  const [promptSearch, setPromptSearch] = useState("");
  const [selectedGroup, setSelectedGroup] = useState<
    Id<"promptGroups"> | "all"
  >("all");
  const [selectedPromptId, setSelectedPromptId] =
    useState<Id<"prompts"> | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<Id<"promptRuns"> | null>(
    null
  );
  const [runDetailContext, setRunDetailContext] =
    useState<RunDetailContext>(null);
  const search = useDeferredValue(promptSearch.trim().toLowerCase());
  const [newEntityName, setNewEntityName] = useState("");
  const [newEntityKind, setNewEntityKind] = useState<TrackedKind>("brand");
  const [newEntityDomain, setNewEntityDomain] = useState("");

  const model = modelFilter === "all" ? undefined : modelFilter;
  const overview = useQuery(api.analytics.getOverview, { rangeDays, model });
  const promptGroups = useQuery(api.analytics.listPromptGroups, {});
  const prompts = useQuery(api.analytics.listPrompts, {});
  const promptAnalytics = useQuery(api.analytics.listPromptResponseAnalytics, {
    groupId: selectedGroup === "all" ? undefined : selectedGroup,
    model,
    rangeDays,
  });
  const queueStatus = useQuery(api.analytics.getQueueStatus, {});
  const runs = useQuery(api.analytics.listPromptRuns, { limit: 200, model });
  const sources = useQuery(api.analytics.listSources, {
    rangeDays,
    model,
    limit: 80,
  });
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
  const createPrompt = useMutation(api.analytics.createPrompt);
  const updatePrompt = useMutation(api.analytics.updatePrompt);
  const deletePrompt = useMutation(api.analytics.deletePrompt);
  const triggerSelectedPromptsNow = useMutation(
    api.analytics.triggerSelectedPromptsNow
  );
  const createTrackedEntity = useMutation(api.analytics.createTrackedEntity);
  const updateTrackedEntity = useMutation(api.analytics.updateTrackedEntity);
  const deleteTrackedEntity = useMutation(api.analytics.deleteTrackedEntity);

  const loading =
    overview === undefined ||
    promptGroups === undefined ||
    prompts === undefined ||
    promptAnalytics === undefined ||
    runs === undefined ||
    sources === undefined;
  const hasData = !!overview && overview.kpis.totalRuns > 0;
  const queueStatusHydratedRef = useRef(false);
  const lastFinishedRunIdRef = useRef<Id<"promptRuns"> | null>(null);
  const runningToastIdRef = useRef<string | number | null>(null);

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
      if (runDetailContext === "prompts") {
        setSelectedRunId(null);
        setRunDetailContext(null);
      }
      return;
    }

    if (
      selectedPromptId &&
      promptRows.some((row) => row.id === selectedPromptId)
    ) {
      return;
    }

    setSelectedPromptId(null);
    if (runDetailContext === "prompts") {
      setSelectedRunId(null);
      setRunDetailContext(null);
    }
  }, [promptRows, selectedPromptId, runDetailContext]);

  useEffect(() => {
    if (!queueStatus) {
      return;
    }

    const latestFinishedRunId = queueStatus.latestFinishedRun?.id ?? null;
    if (!queueStatusHydratedRef.current) {
      queueStatusHydratedRef.current = true;
      lastFinishedRunIdRef.current = latestFinishedRunId;
      return;
    }

    if (queueStatus.runningCount > 0 && runningToastIdRef.current == null) {
      runningToastIdRef.current = toast.loading("Run in progress...");
    }

    if (queueStatus.runningCount === 0 && runningToastIdRef.current != null) {
      toast.dismiss(runningToastIdRef.current);
      runningToastIdRef.current = null;
    }

    if (
      latestFinishedRunId &&
      latestFinishedRunId !== lastFinishedRunIdRef.current
    ) {
      lastFinishedRunIdRef.current = latestFinishedRunId;
      const label = queueStatus.latestFinishedRun?.runLabel ?? "Run";
      if (queueStatus.latestFinishedRun?.status === "success") {
        toast.success(`${label} completed.`);
      } else {
        toast.error(`${label} failed.`);
      }
    }
  }, [queueStatus]);

  const trend = useMemo(() => {
    if (!overview) return [];
    return overview.trendSeries.map((item) => ({
      label: formatDay(item.day),
      citation: item.citationQuality ?? 0,
      coverage: clamp(
        (item.runCount / Math.max(overview.kpis.totalRuns, 1)) * 100,
        0,
        100
      ),
    }));
  }, [overview]);

  const responseRows = useMemo(
    () =>
      (runs ?? []).filter(
        (run) =>
          run.responseSummary ||
          run.status === "success" ||
          run.status === "failed"
      ),
    [runs]
  );

  const kpis = useMemo(
    () => mapKpis(overview, sources?.meta.totalDomains),
    [overview, sources?.meta.totalDomains]
  );

  const recentRuns = useMemo(
    () =>
      (runs ?? []).slice(0, 4).map((run) => ({
        id: String(run._id),
        promptName: run.promptName,
        status: run.status,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
        latencyMs: run.latencyMs,
        sourceCount: run.sourceCount,
        citationCount: run.citationCount,
      })),
    [runs]
  );

  const selectedGroupName = useMemo(() => {
    if (selectedGroup === "all") return "All prompts";
    return (promptGroups ?? []).find((group) => group._id === selectedGroup)
      ?.name;
  }, [promptGroups, selectedGroup]);

  const navigatePage = (nextPage: PageKey) => {
    setPage(nextPage);
    setSelectedPromptId(null);
    setSelectedRunId(null);
    setRunDetailContext(null);
  };

  const refreshAnalytics = () => {
    window.location.reload();
  };

  const openPrompt = (promptId: Id<"prompts"> | null) => {
    setPage("prompts");
    setSelectedPromptId(promptId);
    setSelectedRunId(null);
    setRunDetailContext(null);
  };

  const openRunFromPromptDetail = (runId: Id<"promptRuns"> | null) => {
    setSelectedRunId(runId);
    setRunDetailContext(runId ? "prompts" : null);
  };

  const openGlobalRunDetail = (
    nextPage: "runs" | "responses",
    runId: Id<"promptRuns"> | null
  ) => {
    setPage(nextPage);
    setSelectedRunId(runId);
    setRunDetailContext(runId ? nextPage : null);
  };

  const promptView =
    selectedRunId && runDetailContext === "prompts"
      ? "response"
      : selectedPromptId
        ? "prompt"
        : "list";
  const showingRunDetailForRuns =
    page === "runs" && runDetailContext === "runs" && selectedRunId !== null;
  const showingRunDetailForResponses =
    page === "responses" &&
    runDetailContext === "responses" &&
    selectedRunId !== null;

  const breadcrumbs = (() => {
    if (page === "prompts") {
      const items: Array<{ label: string; onClick?: () => void }> = [
        {
          label: "Prompts",
          onClick: promptView !== "list" ? () => openPrompt(null) : undefined,
        },
      ];

      if (promptView !== "list" && promptAnalysis?.prompt.name) {
        items.push({
          label: promptAnalysis.prompt.name,
          onClick:
            promptView === "response"
              ? () => openRunFromPromptDetail(null)
              : undefined,
        });
      }

      if (promptView === "response") {
        items.push({ label: "Response Detail" });
      }

      return items;
    }

    if (showingRunDetailForRuns) {
      return [
        { label: "Runs", onClick: () => openGlobalRunDetail("runs", null) },
        { label: "Run Detail" },
      ];
    }

    if (showingRunDetailForResponses) {
      return [
        {
          label: "Responses",
          onClick: () => openGlobalRunDetail("responses", null),
        },
        { label: "Response Detail" },
      ];
    }

    return [{ label: page.charAt(0).toUpperCase() + page.slice(1) }];
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
        <AppSidebar page={page} onPage={navigatePage} />
        <SidebarInset>
          <SiteHeader
            rangeDays={rangeDays}
            onRangeDays={setRangeDays}
            modelFilter={modelFilter}
            onModelFilter={setModelFilter}
            onRefresh={refreshAnalytics}
            breadcrumbs={breadcrumbs}
          />

          <div className="flex flex-1 flex-col">
            {loading && (
              <div className="flex flex-col gap-2 px-4 pt-4 lg:px-6">
                <StatusBanner text="Loading analytics data..." />
              </div>
            )}

            {page === "overview" && (
              <OverviewPage
                loading={loading}
                hasData={hasData}
                kpis={kpis}
                trend={trend}
                overview={overview}
                sources={sources?.items ?? []}
                recentRuns={recentRuns}
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
                    search={promptSearch}
                    onSearch={setPromptSearch}
                    onCreateGroup={createPromptGroup}
                    onCreatePrompt={createPrompt}
                    onUpdatePrompt={updatePrompt}
                    onDeletePrompt={deletePrompt}
                    onTriggerSelectedNow={triggerSelectedPromptsNow}
                  />
                )}
                {promptView === "prompt" && (
                  <PromptDetailPage
                    selectedGroupName={selectedGroupName}
                    promptAnalysis={promptAnalysis}
                    onBack={() => openPrompt(null)}
                    selectedRunId={selectedRunId}
                    onOpenRun={openRunFromPromptDetail}
                  />
                )}
                {promptView === "response" && (
                  <ResponseDetailPage
                    runDetail={runDetail}
                    onBack={() => openRunFromPromptDetail(null)}
                  />
                )}
              </>
            )}

            {page === "runs" &&
              (showingRunDetailForRuns ? (
                <ResponseDetailPage
                  runDetail={runDetail}
                  backLabel="Back to runs"
                  onBack={() => openGlobalRunDetail("runs", null)}
                  onOpenPrompt={
                    runDetail?.run.promptId
                      ? () => openPrompt(runDetail.run.promptId)
                      : undefined
                  }
                />
              ) : (
                <RunsPage
                  runs={runs ?? []}
                  selectedRunId={selectedRunId}
                  onOpenRun={(runId) => openGlobalRunDetail("runs", runId)}
                  onOpenPrompt={openPrompt}
                />
              ))}

            {page === "groups" && (
              <GroupsPage
                groups={promptGroups ?? []}
                prompts={prompts ?? []}
                onOpenPrompt={openPrompt}
                onAddMore={(groupId) => {
                  setSelectedGroup(groupId);
                  openPrompt(null);
                }}
              />
            )}

            {page === "responses" &&
              (showingRunDetailForResponses ? (
                <ResponseDetailPage
                  runDetail={runDetail}
                  backLabel="Back to responses"
                  onBack={() => openGlobalRunDetail("responses", null)}
                  onOpenPrompt={
                    runDetail?.run.promptId
                      ? () => openPrompt(runDetail.run.promptId)
                      : undefined
                  }
                />
              ) : (
                <ResponsesPage
                  runs={responseRows}
                  selectedRunId={selectedRunId}
                  onOpenRun={(runId) => openGlobalRunDetail("responses", runId)}
                  onOpenPrompt={openPrompt}
                />
              ))}

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
              />
            )}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}

type Kpi = { label: string; value: string; delta: string; tone: Tone };

function mapKpis(
  overview:
    | {
        kpis: {
          citationQuality?: number;
          deltaCitationQuality?: number;
          runSuccessRate?: number;
          totalRuns: number;
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
      label: "Captured runs",
      value: String(overview.kpis.totalRuns),
      delta:
        overview.recentRuns[0] !== undefined
          ? formatFreshness(overview.recentRuns[0].startedAt)
          : "No recent run",
      tone: "neutral",
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
      tone: "neutral",
    },
    {
      label: "Run health",
      value: formatPercent(overview.kpis.runSuccessRate),
      delta: `${overview.kpis.totalRuns} total`,
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
