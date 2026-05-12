import { describe, expect, it } from "vitest";

import {
  buildPromptGenerationPrompt,
  normalizePromptGenerationOutput,
  parseJsonContent,
} from "./prompt-generation-core.mjs";

const validPayload = {
  entitySummary: "OpenPeec monitors AI visibility.",
  competitorNotes: "Tracks competitors when relevant.",
  warnings: [],
  groups: [
    {
      name: "Category discovery",
      slug: "category-discovery",
      description: "Unaided category prompts.",
      intentCategory: "category_discovery",
      sentimentLens: "neutral",
      sortOrder: 0,
      prompts: [
        {
          promptText: "What are the best AI visibility tools?",
          intentCategory: "category_discovery",
          sentimentLens: "neutral",
          funnelStage: "awareness",
          audience: "SEO marketers",
          topic: "AI visibility",
          priority: "high",
          rationale: "Measures unaided category inclusion.",
          sourceUrls: ["https://openpeec.ai"],
        },
        {
          promptText: "What are the best AI visibility tools?",
          intentCategory: "category_discovery",
          sentimentLens: "neutral",
          funnelStage: "awareness",
          audience: "SEO marketers",
          topic: "AI visibility",
          priority: "high",
          rationale: "Duplicate should be removed.",
          sourceUrls: ["https://openpeec.ai"],
        },
      ],
    },
  ],
};

describe("prompt generation core", () => {
  it("parses fenced JSON content", () => {
    expect(parseJsonContent('```json\n{"ok":true}\n```')).toEqual({
      ok: true,
    });
  });

  it("normalizes valid bridge output and deduplicates prompt text", () => {
    const result = normalizePromptGenerationOutput(validPayload);

    expect(result.entitySummary).toBe("OpenPeec monitors AI visibility.");
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].prompts).toHaveLength(1);
    expect(result.groups[0].prompts[0]).toMatchObject({
      promptText: "What are the best AI visibility tools?",
      intentCategory: "category_discovery",
      sentimentLens: "neutral",
      priority: "high",
    });
  });

  it("rejects unsupported categories", () => {
    expect(() =>
      normalizePromptGenerationOutput({
        ...validPayload,
        groups: [
          {
            ...validPayload.groups[0],
            intentCategory: "keyword_rank_tracking",
          },
        ],
      })
    ).toThrow(/intentCategory/i);
  });

  it("builds a detailed GEO categorisation prompt for Codex", () => {
    const prompt = buildPromptGenerationPrompt(
      {
        entity: {
          name: "OpenPeec",
          slug: "openpeec",
          kind: "brand",
          aliases: [],
          ownedDomains: ["openpeec.ai"],
        },
        competitors: [],
        websiteUrl: "https://openpeec.ai",
        researchSummary: "OpenPeec tracks AI visibility.",
        existingPromptGroups: [],
        existingPrompts: [],
      },
      "OpenPeec monitors AI answer visibility."
    );

    expect(prompt).toContain("Categorisation is the core product output");
    expect(prompt).toContain("risk_objection");
    expect(prompt).toContain("The prompt intentionally probes objections");
    expect(prompt).toContain("Citation/source audit");
  });
});
