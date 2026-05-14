import type { ReactNode } from "react";
import { CircleHelp } from "lucide-react";

import { TooltipFocusable } from "@/components/ui/tooltip-focusable";

export function InfoTooltip({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <TooltipFocusable
      label={label}
      tooltip={children}
      variant="icon"
      className={className}
    >
      <CircleHelp className="size-3.5" />
    </TooltipFocusable>
  );
}

export const clickableTableRowClassName =
  "hover:bg-muted/35 focus-visible:bg-muted/35 focus-visible:ring-ring/40 cursor-pointer transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset";
