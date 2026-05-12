export type PromptIntentCategory =
  | "category_discovery"
  | "brand_factual"
  | "recommendation"
  | "comparison"
  | "alternative"
  | "problem_solution"
  | "how_to"
  | "pricing_buying"
  | "review_reputation"
  | "risk_objection"
  | "citation_source"
  | "content_gap"
  | "uncategorized";

export type PromptSentimentLens =
  | "positive"
  | "neutral"
  | "negative"
  | "comparative"
  | "mixed";

export type PromptFunnelStage =
  | "awareness"
  | "consideration"
  | "decision"
  | "retention";

export type PromptPriority = "high" | "medium" | "low";
export type PromptReviewState = "draft" | "archived";
export type PromptGeneratedBy = "manual" | "codex" | "import";

export const promptIntentCategoryOptions: Array<{
  value: PromptIntentCategory;
  label: string;
}> = [
  { value: "category_discovery", label: "Category discovery" },
  { value: "brand_factual", label: "Brand factual" },
  { value: "recommendation", label: "Recommendation" },
  { value: "comparison", label: "Comparison" },
  { value: "alternative", label: "Alternative" },
  { value: "problem_solution", label: "Problem-solution" },
  { value: "how_to", label: "How-to" },
  { value: "pricing_buying", label: "Pricing / buying" },
  { value: "review_reputation", label: "Review / reputation" },
  { value: "risk_objection", label: "Risk / objection" },
  { value: "citation_source", label: "Citation / source" },
  { value: "content_gap", label: "Content gap" },
  { value: "uncategorized", label: "Uncategorized" },
];

export const promptSentimentLensOptions: Array<{
  value: PromptSentimentLens;
  label: string;
}> = [
  { value: "positive", label: "Positive" },
  { value: "neutral", label: "Neutral" },
  { value: "negative", label: "Negative" },
  { value: "comparative", label: "Comparative" },
  { value: "mixed", label: "Mixed" },
];

export const promptFunnelStageOptions: Array<{
  value: PromptFunnelStage;
  label: string;
}> = [
  { value: "awareness", label: "Awareness" },
  { value: "consideration", label: "Consideration" },
  { value: "decision", label: "Decision" },
  { value: "retention", label: "Retention" },
];

export const promptPriorityOptions: Array<{
  value: PromptPriority;
  label: string;
}> = [
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

export const promptGeneratedByOptions: Array<{
  value: PromptGeneratedBy;
  label: string;
}> = [
  { value: "manual", label: "Manual" },
  { value: "codex", label: "Codex" },
  { value: "import", label: "Import" },
];

export function promptOptionLabel<T extends string>(
  options: Array<{ value: T; label: string }>,
  value: T | undefined
) {
  return options.find((option) => option.value === value)?.label ?? "-";
}

export function parseSourceUrls(text: string) {
  return [
    ...new Set(
      text
        .split(/\r?\n|,/)
        .map((url) => url.trim())
        .filter(Boolean)
    ),
  ];
}
