import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Small, all-caps, wide-tracked label rendered above section headers, KPI
 * values, and panel titles throughout the dashboard. Centralizes the
 * "11px / medium / uppercase / 0.18em tracking / muted-foreground"
 * recipe that was previously copy-pasted at 5+ callsites with mismatched
 * tracking values.
 *
 * The visual recipe lives in `.text-eyebrow` (see src/index.css). This
 * component is a typed convenience wrapper that lets you pass an icon
 * before the label and switches the rendered tag via `as`.
 */
type EyebrowOwnProps = {
  className?: string;
  children: React.ReactNode;
  /** Optional leading icon (e.g. a lucide-react icon). Sized to match. */
  icon?: React.ReactNode;
  /** Element tag, defaults to <p>. Use "div" inside non-paragraph contexts. */
  as?: "p" | "div" | "span" | "h2" | "h3";
};

export function Eyebrow({
  className,
  children,
  icon,
  as: Tag = "p",
}: EyebrowOwnProps) {
  const content = icon ? (
    <span className="inline-flex items-center gap-1">
      <span className="inline-flex size-3 items-center justify-center [&_svg]:size-3">
        {icon}
      </span>
      {children}
    </span>
  ) : (
    children
  );
  return (
    <Tag className={cn("text-eyebrow", className)} data-slot="eyebrow">
      {content}
    </Tag>
  );
}
