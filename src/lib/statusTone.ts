/**
 * Semantic status tones for the dashboard. Centralizes the mapping from
 * status meaning ("success" / "warning" / "danger" / "info" / "neutral")
 * to design-token classnames, so consumers never reach for raw
 * `text-emerald-700 dark:text-emerald-300` palette values.
 *
 * The tokens themselves live in src/index.css:
 *   --success / --success-foreground / --success-subtle
 *   --warning / --warning-foreground / --warning-subtle
 *   --info    / --info-foreground    / --info-subtle
 *   --destructive (existing) for danger
 *   --muted    (existing) for neutral
 *
 * Three flavors are exposed because the dashboard uses status colors in
 * three visual treatments:
 *
 *   1. solid    — bright fill on light/dark text. Used for active badges,
 *                 small swatches, and emphasis dots.
 *   2. subtle   — tinted background + saturated text. Used for status
 *                 banners, tone-coded table cells, and pill chips that
 *                 sit inside dense tables.
 *   3. text     — saturated text only. Used for tone-coded numbers, deltas,
 *                 and table rows where adding a background would compete
 *                 with table chrome.
 *
 * Add new tones by extending the StatusTone union and the three records.
 */

export type StatusTone =
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "neutral";

const SOLID_BG: Record<StatusTone, string> = {
  success: "bg-success text-success-foreground",
  warning: "bg-warning text-warning-foreground",
  danger: "bg-destructive text-destructive-foreground",
  info: "bg-info text-info-foreground",
  neutral: "bg-muted text-muted-foreground",
};

const SUBTLE_BG: Record<StatusTone, string> = {
  success:
    "bg-success/10 text-success border-success/20 dark:text-success",
  warning:
    "bg-warning/15 text-warning-foreground border-warning/25 dark:text-warning",
  danger:
    "bg-destructive/10 text-destructive border-destructive/20 dark:text-destructive",
  info: "bg-info/10 text-info border-info/20 dark:text-info",
  neutral: "bg-muted text-muted-foreground border-border",
};

const TEXT_ONLY: Record<StatusTone, string> = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
  info: "text-info",
  neutral: "text-muted-foreground",
};

const FILL: Record<StatusTone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive",
  info: "bg-info",
  neutral: "bg-muted-foreground",
};

/**
 * Pick a tone treatment. Three variants:
 *   - "solid":  solid bg + contrasting fg (active badges, dots).
 *   - "subtle": tinted bg + saturated fg + matching border (banners, chips).
 *   - "text":   saturated fg only (numbers, deltas).
 *   - "fill":   solid bg only (decorative swatches like stacked bars).
 */
export function statusTone(
  tone: StatusTone,
  variant: "solid" | "subtle" | "text" | "fill" = "subtle"
): string {
  switch (variant) {
    case "solid":
      return SOLID_BG[tone];
    case "text":
      return TEXT_ONLY[tone];
    case "fill":
      return FILL[tone];
    case "subtle":
    default:
      return SUBTLE_BG[tone];
  }
}

/**
 * Source/citation type → tone, used by the dashboard's domain and source
 * tables. Centralized so the same source type renders the same tone in
 * every table.
 */
export const sourceTypeTone: Record<string, StatusTone> = {
  ugc: "warning",
  editorial: "info",
  corporate: "info", // visually distinct via variant choice at callsite
  docs: "success",
  news: "danger",
  social: "info",
  other: "neutral",
};

/**
 * Resolve a source-type string (case-insensitive) to a subtle-variant tone
 * class. Falls back to neutral when the type is unknown.
 */
export function sourceTypeToneClass(
  type: string | null | undefined,
  variant: "solid" | "subtle" | "text" | "fill" = "subtle"
): string {
  const key = (type ?? "").toLowerCase();
  const tone = sourceTypeTone[key] ?? "neutral";
  return statusTone(tone, variant);
}
