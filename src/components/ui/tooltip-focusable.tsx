import * as React from "react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Keyboard-focusable, screen-reader-labelled wrapper that opens a Tooltip
 * on focus or hover. Replaces three near-identical bare `<button>`
 * blocks that were re-implementing the same focus-ring boilerplate just
 * to make non-button content (badges, labels, icons) trigger a Tooltip.
 *
 * Why a real <button>? Tooltips need a focusable trigger — bare <span> /
 * <div> can't receive focus without `tabIndex` plumbing, and turning the
 * wrapped element into a button via `asChild` breaks layout for content
 * that already has its own semantics (e.g. a Badge).
 *
 * Variants:
 *   - "help":   cursor-help, no padding. Wraps labels/badges to surface
 *               an explanation tooltip without changing visual weight.
 *   - "icon":   square 20px hit-target with a hover color shift. Wraps
 *               the lucide CircleHelp icon used as an info affordance.
 */
type TooltipFocusableProps = {
  /** Plain-text label used both for aria-label and screen readers. */
  label: string;
  /** Tooltip body. Can be a string or rich JSX. */
  tooltip: React.ReactNode;
  /** Element inside the focusable trigger. */
  children: React.ReactNode;
  /** Visual treatment. Defaults to "help" (transparent wrapper). */
  variant?: "help" | "icon";
  className?: string;
};

const VARIANT_CLASSES: Record<NonNullable<TooltipFocusableProps["variant"]>, string> = {
  help: "inline-flex w-fit cursor-help rounded-sm border-0 bg-transparent p-0 text-left outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
  icon: "text-muted-foreground hover:text-foreground inline-flex size-5 items-center justify-center rounded-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
};

export function TooltipFocusable({
  label,
  tooltip,
  children,
  variant = "help",
  className,
}: TooltipFocusableProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          data-slot="tooltip-focusable"
          className={cn(VARIANT_CLASSES[variant], className)}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
