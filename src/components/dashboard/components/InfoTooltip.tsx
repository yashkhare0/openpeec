import type { ReactNode } from "react";
import { CircleHelp } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

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
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className={cn(
            "text-muted-foreground hover:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 inline-flex size-5 items-center justify-center rounded-sm transition-colors outline-none focus-visible:ring-3",
            className
          )}
        >
          <CircleHelp className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent>{children}</TooltipContent>
    </Tooltip>
  );
}

export const clickableTableRowClassName =
  "hover:bg-muted/35 focus-visible:bg-muted/35 focus-visible:ring-ring/40 cursor-pointer transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset";
