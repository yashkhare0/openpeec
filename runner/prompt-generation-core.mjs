export const PROMPT_INTENT_CATEGORIES = [
  "category_discovery",
  "brand_factual",
  "recommendation",
  "comparison",
  "alternative",
  "problem_solution",
  "how_to",
  "pricing_buying",
  "review_reputation",
  "risk_objection",
  "citation_source",
  "content_gap",
  "uncategorized",
];

export const PROMPT_SENTIMENT_LENSES = [
  "positive",
  "neutral",
  "negative",
  "comparative",
  "mixed",
];

export const PROMPT_FUNNEL_STAGES = [
  "awareness",
  "consideration",
  "decision",
  "retention",
];

export const PROMPT_PRIORITIES = ["high", "medium", "low"];

export function parseJsonContent(content) {
  const trimmed = String(content ?? "").trim();
  if (!trimmed) {
    throw new Error("Codex bridge returned an empty response.");
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) {
      return JSON.parse(fenced[1]);
    }
    throw new Error("Codex bridge returned invalid JSON.");
  }
}

export function normalizePromptText(input) {
  return String(input ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeForDedup(input) {
  return normalizePromptText(input).toLowerCase();
}

function assertEnum(value, values, label) {
  if (!values.includes(value)) {
    throw new Error(`${label} is not supported: ${String(value)}`);
  }
}

function normalizeOptionalString(input) {
  const value = String(input ?? "").trim();
  return value || undefined;
}

function normalizeStringArray(input) {
  if (!Array.isArray(input)) {
    return [];
  }
  return [
    ...new Set(
      input
        .map((item) => normalizeOptionalString(item))
        .filter((item) => Boolean(item))
    ),
  ];
}

export function normalizePromptGenerationOutput(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Prompt generation output must be an object.");
  }
  if (!Array.isArray(payload.groups)) {
    throw new Error("Prompt generation output must include groups.");
  }

  const seenPrompts = new Set();
  const groups = [];
  for (const [groupIndex, rawGroup] of payload.groups.entries()) {
    if (!rawGroup || typeof rawGroup !== "object") {
      throw new Error(`Prompt group ${groupIndex + 1} must be an object.`);
    }
    const name = normalizeOptionalString(rawGroup.name);
    if (!name) {
      throw new Error(`Prompt group ${groupIndex + 1} is missing a name.`);
    }
    assertEnum(
      rawGroup.intentCategory,
      PROMPT_INTENT_CATEGORIES,
      `Prompt group "${name}" intentCategory`
    );
    assertEnum(
      rawGroup.sentimentLens,
      PROMPT_SENTIMENT_LENSES,
      `Prompt group "${name}" sentimentLens`
    );
    if (!Array.isArray(rawGroup.prompts)) {
      throw new Error(`Prompt group "${name}" must include prompts.`);
    }

    const prompts = [];
    for (const [promptIndex, rawPrompt] of rawGroup.prompts.entries()) {
      const promptText = normalizePromptText(rawPrompt?.promptText);
      if (!promptText) {
        throw new Error(
          `Prompt ${promptIndex + 1} in "${name}" is missing promptText.`
        );
      }
      if (rawPrompt.intentCategory) {
        assertEnum(
          rawPrompt.intentCategory,
          PROMPT_INTENT_CATEGORIES,
          `Prompt "${promptText}" intentCategory`
        );
      }
      if (rawPrompt.sentimentLens) {
        assertEnum(
          rawPrompt.sentimentLens,
          PROMPT_SENTIMENT_LENSES,
          `Prompt "${promptText}" sentimentLens`
        );
      }
      if (rawPrompt.funnelStage) {
        assertEnum(
          rawPrompt.funnelStage,
          PROMPT_FUNNEL_STAGES,
          `Prompt "${promptText}" funnelStage`
        );
      }
      if (rawPrompt.priority) {
        assertEnum(
          rawPrompt.priority,
          PROMPT_PRIORITIES,
          `Prompt "${promptText}" priority`
        );
      }

      const dedupKey = normalizeForDedup(promptText);
      if (seenPrompts.has(dedupKey)) {
        continue;
      }
      seenPrompts.add(dedupKey);
      prompts.push({
        promptText,
        intentCategory: rawPrompt.intentCategory,
        sentimentLens: rawPrompt.sentimentLens,
        funnelStage: rawPrompt.funnelStage,
        audience: normalizeOptionalString(rawPrompt.audience),
        topic: normalizeOptionalString(rawPrompt.topic),
        priority: rawPrompt.priority,
        rationale: normalizeOptionalString(rawPrompt.rationale),
        sourceUrls: normalizeStringArray(rawPrompt.sourceUrls),
      });
    }

    groups.push({
      name,
      slug: normalizeOptionalString(rawGroup.slug),
      description: normalizeOptionalString(rawGroup.description),
      intentCategory: rawGroup.intentCategory,
      sentimentLens: rawGroup.sentimentLens,
      sortOrder:
        typeof rawGroup.sortOrder === "number"
          ? rawGroup.sortOrder
          : groupIndex,
      prompts,
    });
  }

  return {
    entitySummary: normalizeOptionalString(payload.entitySummary),
    competitorNotes: normalizeOptionalString(payload.competitorNotes),
    warnings: normalizeStringArray(payload.warnings),
    groups,
  };
}

export function promptGenerationSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["entitySummary", "competitorNotes", "warnings", "groups"],
    properties: {
      entitySummary: { type: "string" },
      competitorNotes: { type: "string" },
      warnings: { type: "array", items: { type: "string" } },
      groups: {
        type: "array",
        minItems: 8,
        maxItems: 12,
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "name",
            "slug",
            "description",
            "intentCategory",
            "sentimentLens",
            "sortOrder",
            "prompts",
          ],
          properties: {
            name: { type: "string" },
            slug: { type: "string" },
            description: { type: "string" },
            intentCategory: {
              type: "string",
              enum: PROMPT_INTENT_CATEGORIES,
            },
            sentimentLens: {
              type: "string",
              enum: PROMPT_SENTIMENT_LENSES,
            },
            sortOrder: { type: "number" },
            prompts: {
              type: "array",
              minItems: 4,
              maxItems: 8,
              items: {
                type: "object",
                additionalProperties: false,
                required: [
                  "promptText",
                  "intentCategory",
                  "sentimentLens",
                  "funnelStage",
                  "audience",
                  "topic",
                  "priority",
                  "rationale",
                  "sourceUrls",
                ],
                properties: {
                  promptText: { type: "string" },
                  intentCategory: {
                    type: "string",
                    enum: PROMPT_INTENT_CATEGORIES,
                  },
                  sentimentLens: {
                    type: "string",
                    enum: PROMPT_SENTIMENT_LENSES,
                  },
                  funnelStage: {
                    type: "string",
                    enum: PROMPT_FUNNEL_STAGES,
                  },
                  audience: { type: "string" },
                  topic: { type: "string" },
                  priority: { type: "string", enum: PROMPT_PRIORITIES },
                  rationale: { type: "string" },
                  sourceUrls: { type: "array", items: { type: "string" } },
                },
              },
            },
          },
        },
      },
    },
  };
}

export function buildPromptGenerationPrompt(claimed, websiteResearch = "") {
  return [
    "Create a GEO/AEO prompt library for the tracked entity.",
    "Positive, neutral, negative, comparative, and mixed are prompt lenses, not expected answer sentiment.",
    "Generate 8-12 prompt groups and 4-8 prompts per group.",
    "Prompts should reflect real buyer/research questions that AI assistants receive.",
    "Cover category discovery, brand facts, recommendations, comparisons, alternatives, objections, citations, pricing, and content gaps.",
    "Do not duplicate existing prompts. Use competitors only when they are relevant.",
    "Return strict JSON only.",
    "",
    JSON.stringify(
      {
        entity: claimed.entity,
        competitors: claimed.competitors,
        websiteUrl: claimed.websiteUrl,
        researchSummary: claimed.researchSummary,
        websiteResearch,
        existingPromptGroups: claimed.existingPromptGroups,
        existingPrompts: claimed.existingPrompts,
        allowedIntentCategories: PROMPT_INTENT_CATEGORIES,
        allowedSentimentLenses: PROMPT_SENTIMENT_LENSES,
        allowedFunnelStages: PROMPT_FUNNEL_STAGES,
        allowedPriorities: PROMPT_PRIORITIES,
      },
      null,
      2
    ),
  ].join("\n");
}

export function stripHtmlText(html) {
  return String(html ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 12000);
}
