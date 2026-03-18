import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MonitoringDashboard } from "./MonitoringDashboard";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  mutation: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useQuery: mocks.query,
  useMutation: mocks.mutation,
}));

vi.mock("../../../convex/_generated/api", () => ({
  api: {
    analytics: {
      getOverview: "getOverview",
      listPromptGroups: "listPromptGroups",
      listPromptResponseAnalytics: "listPromptResponseAnalytics",
      listPromptJobs: "listPromptJobs",
      getQueueStatus: "getQueueStatus",
      listPromptRuns: "listPromptRuns",
      listSources: "listSources",
      getPromptAnalysis: "getPromptAnalysis",
      listTrackedEntities: "listTrackedEntities",
      getPromptRun: "getPromptRun",
      createPromptGroup: "createPromptGroup",
      updatePromptGroup: "updatePromptGroup",
      deletePromptGroup: "deletePromptGroup",
      createPrompt: "createPrompt",
      updatePrompt: "updatePrompt",
      deletePrompt: "deletePrompt",
      createPromptJob: "createPromptJob",
      updatePromptJob: "updatePromptJob",
      deletePromptJob: "deletePromptJob",
      triggerSelectedPromptsNow: "triggerSelectedPromptsNow",
      triggerPromptJobNow: "triggerPromptJobNow",
      createTrackedEntity: "createTrackedEntity",
      updateTrackedEntity: "updateTrackedEntity",
      deleteTrackedEntity: "deleteTrackedEntity",
    },
  },
}));

vi.mock("./components/ProductTour", () => ({
  ProductTour: () => null,
}));

const now = Date.now();

const overviewData = {
  kpis: {
    rangeDays: 7,
    totalRuns: 4,
    totalCitations: 12,
    visibility: 61,
    citationQuality: 74,
    averageCitationPosition: 2.4,
    runSuccessRate: 100,
    deltaVisibility: 4.2,
    deltaCitationQuality: 2.1,
  },
  trendSeries: [
    {
      day: "2026-03-16",
      visibility: 58,
      citationQuality: 70,
      averagePosition: 2.6,
      runCount: 1,
    },
    {
      day: "2026-03-17",
      visibility: 60,
      citationQuality: 73,
      averagePosition: 2.4,
      runCount: 1,
    },
    {
      day: "2026-03-18",
      visibility: 61,
      citationQuality: 74,
      averagePosition: 2.2,
      runCount: 2,
    },
  ],
  modelComparison: [
    {
      model: "gpt-5",
      runCount: 4,
      visibility: 61,
      citationQuality: 74,
      averagePosition: 2.4,
      deltaVisibility: 4.2,
      deltaCitationQuality: 2.1,
      deltaPosition: -0.2,
    },
  ],
  topSources: [],
  domainTypeBreakdown: [
    { type: "docs", citations: 5, share: 41.7 },
    { type: "editorial", citations: 4, share: 33.3 },
    { type: "ugc", citations: 3, share: 25 },
  ],
  recentRuns: [{ startedAt: now - 10 * 60 * 1000 }],
  promptComparison: [
    {
      promptId: "prompt_1",
      name: "Best AI visibility tools",
      responseCount: 3,
      latestStatus: "success",
      latestResponseSummary:
        "OpenPeec is cited alongside Swept and CiteCompass.",
      sourceDiversity: 4,
      responseDrift: 32.4,
      topEntity: "OpenPeec",
    },
  ],
  entityLeaderboard: [
    {
      entityId: "entity_1",
      name: "OpenPeec",
      kind: "brand",
      mentionCount: 4,
      responseCount: 3,
      citationCount: 2,
    },
  ],
};

const promptGroups = [{ _id: "group_1", name: "Acquisition" }];

const promptRows = [
  {
    id: "prompt_1",
    name: "Best AI visibility tools",
    group: "Acquisition",
    model: "gpt-5",
    latestVisibility: 61,
    latestCitationQuality: 74,
    latestRunAt: now - 10 * 60 * 1000,
    latestRunId: "run_2",
    latestStatus: "success",
    latestResponseSummary: "OpenPeec is cited alongside Swept and CiteCompass.",
    latestSourceCount: 3,
    responseCount: 3,
    sourceDiversity: 4,
    topSources: ["docs.openpeec.ai", "swept.ai", "citecompass.com"],
    topEntities: ["OpenPeec", "Swept"],
    responseDrift: 32.4,
    sourceVariance: 27.5,
    active: true,
  },
];

const listSourcesData = {
  meta: {
    rangeDays: 7,
    totalRuns: 4,
    totalCitations: 12,
    totalDomains: 4,
  },
  items: [
    {
      domain: "docs.openpeec.ai",
      type: "docs",
      citations: 4,
      responseCount: 3,
      promptCount: 1,
      usedShare: 33.3,
      avgCitationsPerRun: 1,
      avgQualityScore: 81,
      avgPosition: 1.7,
      ownedShare: 100,
      promptNames: ["Best AI visibility tools"],
      latestResponses: [
        {
          runId: "run_2",
          promptId: "prompt_1",
          promptName: "Best AI visibility tools",
          startedAt: now - 10 * 60 * 1000,
          responseSummary: "OpenPeec is cited alongside Swept and CiteCompass.",
          position: 1,
        },
      ],
      mentionedEntities: ["OpenPeec"],
    },
  ],
  domainTypeBreakdown: overviewData.domainTypeBreakdown,
};

const promptAnalysisData = {
  prompt: {
    _id: "prompt_1",
    name: "Best AI visibility tools",
    promptText:
      "What are the best tools for AI visibility and citation analysis?",
    targetModel: "gpt-5",
  },
  summary: {
    responseCount: 3,
    sourceDiversity: 4,
    responseDrift: 32.4,
    sourceVariance: 27.5,
  },
  responses: [
    {
      id: "run_2",
      status: "success",
      startedAt: now - 10 * 60 * 1000,
      finishedAt: now - 9 * 60 * 1000,
      model: "gpt-5",
      visibilityScore: 61,
      citationQualityScore: 74,
      averageCitationPosition: 2.1,
      responseSummary: "OpenPeec is cited alongside Swept and CiteCompass.",
      responseTextPreview:
        "OpenPeec is cited alongside Swept and CiteCompass in the answer.",
      sourceCount: 3,
      sourceDomains: ["docs.openpeec.ai", "swept.ai", "citecompass.com"],
      mentionNames: ["OpenPeec", "Swept"],
      warnings: [],
      evidencePath: "runner/artifacts/run_2/page.png",
    },
  ],
  sourceBreakdown: [
    {
      domain: "docs.openpeec.ai",
      type: "docs",
      citationCount: 4,
      responseCount: 3,
      avgPosition: 1.7,
      avgQualityScore: 81,
      ownedShare: 100,
      latestResponses: [
        {
          runId: "run_2",
          startedAt: now - 10 * 60 * 1000,
          responseSummary: "OpenPeec is cited alongside Swept and CiteCompass.",
        },
      ],
    },
  ],
  entityBreakdown: [
    {
      entityId: "entity_1",
      name: "OpenPeec",
      kind: "brand",
      mentionCount: 4,
      citationCount: 2,
      responseCount: 3,
    },
  ],
};

const runDetailData = {
  run: {
    status: "success",
    startedAt: now - 10 * 60 * 1000,
    model: "gpt-5",
    responseSummary: "OpenPeec is cited alongside Swept and CiteCompass.",
    sourceCount: 3,
    visibilityScore: 61,
    citationQualityScore: 74,
    deeplinkUsed: "https://chatgpt.com/?q=best+ai+visibility+tools",
    evidencePath: "runner/artifacts/run_2/page.png",
    output: JSON.stringify({
      artifacts: {
        video: "runner/artifacts/run_2/video.webm",
        trace: "runner/artifacts/run_2/trace.zip",
        pageHtml: "runner/artifacts/run_2/page.html",
        responseHtml: "runner/artifacts/run_2/response.html",
        sources: "runner/artifacts/run_2/sources.json",
      },
    }),
    warnings: [],
  },
  prompt: {
    name: "Best AI visibility tools",
    promptText:
      "What are the best tools for AI visibility and citation analysis?",
  },
  mentions: [
    {
      entityId: "entity_1",
      name: "OpenPeec",
      slug: "openpeec",
      kind: "brand",
      mentionCount: 3,
      citationCount: 2,
      ownedCitationCount: 2,
      matchedTerms: ["OpenPeec"],
    },
  ],
  citations: [
    {
      domain: "docs.openpeec.ai",
      url: "https://docs.openpeec.ai/guide",
      title: "OpenPeec Docs",
      snippet: "OpenPeec helps monitor prompt responses and cited sources.",
      type: "docs",
      position: 1,
      qualityScore: 81,
      isOwned: true,
      trackedEntity: { name: "OpenPeec", slug: "openpeec" },
    },
  ],
};

describe("MonitoringDashboard", () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.mutation.mockReset();

    mocks.mutation.mockImplementation(() =>
      vi.fn().mockResolvedValue({ queuedCount: 1 })
    );
    mocks.query.mockImplementation((ref: string, args?: unknown) => {
      switch (ref) {
        case "getOverview":
          return overviewData;
        case "listPromptGroups":
          return promptGroups;
        case "listPromptResponseAnalytics":
          return promptRows;
        case "listPromptJobs":
          return [];
        case "getQueueStatus":
          return {
            queuedCount: 0,
            runningCount: 0,
            latestFinishedRun: { startedAt: now - 5 * 60 * 1000 },
          };
        case "listPromptRuns":
          return [{ model: "gpt-5", status: "success" }];
        case "listSources":
          return listSourcesData;
        case "getPromptAnalysis":
          return args === "skip" ? undefined : promptAnalysisData;
        case "listTrackedEntities":
          return [];
        case "getPromptRun":
          return args === "skip" ? undefined : runDetailData;
        default:
          return undefined;
      }
    });
  });

  it("navigates from prompts to prompt detail to response detail", async () => {
    const user = userEvent.setup();
    render(<MonitoringDashboard />);

    expect(screen.getByText("Visibility Command Center")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Prompts" }));

    expect(
      screen.getByText(
        "Select a prompt to inspect its response history, source mix, and brand/entity mentions."
      )
    ).toBeTruthy();
    expect(
      screen.getAllByText("Best AI visibility tools").length
    ).toBeGreaterThan(0);

    await user.click(screen.getByText("Best AI visibility tools"));

    expect(screen.getAllByText("Response Variance").length).toBeGreaterThan(0);
    expect(screen.getByText("Top Sources Used")).toBeTruthy();

    await user.click(
      screen.getByRole("button", {
        name: /OpenPeec is cited alongside Swept and CiteCompass/i,
      })
    );

    expect(screen.getByText("Sources Used in This Response")).toBeTruthy();
    expect(screen.getByText("OpenPeec Docs")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Back to prompt" }));
    expect(
      screen.getByText(
        "Open a response to inspect evidence, citations, and entity mentions."
      )
    ).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Back to prompts" }));
    expect(
      screen.getByText(
        "Select a prompt to inspect its response history, source mix, and brand/entity mentions."
      )
    ).toBeTruthy();
  });
});
