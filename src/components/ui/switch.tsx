"use client";

import * as React from "react";
import { Switch as SwitchPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer focus-visible:border-ring focus-visible:ring-ring/50 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=unchecked]:border-border data-[state=unchecked]:bg-muted dark:data-[state=unchecked]:bg-muted/80 inline-flex h-5 w-9 shrink-0 items-center rounded-full border shadow-xs transition-all outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "bg-card ring-border data-[state=checked]:bg-primary-foreground data-[state=checked]:ring-primary-foreground/60 dark:data-[state=checked]:bg-foreground dark:data-[state=checked]:ring-foreground/70 dark:data-[state=unchecked]:bg-muted-foreground dark:data-[state=unchecked]:ring-background/30 pointer-events-none block size-4 rounded-full shadow-sm ring-1 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0"
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
