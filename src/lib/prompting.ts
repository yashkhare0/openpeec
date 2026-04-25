export const PROMPT_EXCERPT_MAX_LENGTH = 72;

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function derivePromptExcerpt(
  promptText: string | undefined,
  maxLength = PROMPT_EXCERPT_MAX_LENGTH
): string {
  const lines = String(promptText ?? "")
    .split(/\r?\n/)
    .map((line) => collapseWhitespace(line))
    .filter(Boolean);
  const excerpt = lines[0] ?? collapseWhitespace(String(promptText ?? ""));

  if (!excerpt) {
    return "Untitled prompt";
  }
  if (excerpt.length <= maxLength) {
    return excerpt;
  }
  return `${excerpt.slice(0, Math.max(1, maxLength - 1)).trimEnd()}\u2026`;
}
