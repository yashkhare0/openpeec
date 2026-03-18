import type { ReactNode } from "react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function DashboardMetricCardsSkeleton({
  count = 4,
}: {
  count?: number;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, index) => (
        <Card key={index} className="shadow-none">
          <CardContent className="p-4">
            <Skeleton className="h-3 w-24 rounded-sm" />
            <div className="mt-3 space-y-2">
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-4 w-28" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function DashboardCardSkeleton({
  className,
  titleWidth = "w-28",
  descriptionWidth = "w-56",
  showDescription = true,
  contentClassName,
  children,
}: {
  className?: string;
  titleWidth?: string;
  descriptionWidth?: string;
  showDescription?: boolean;
  contentClassName?: string;
  children: ReactNode;
}) {
  return (
    <Card className={cn("shadow-none", className)}>
      <CardHeader className="space-y-2">
        <Skeleton className={cn("h-5", titleWidth)} />
        {showDescription ? (
          <Skeleton className={cn("h-4", descriptionWidth)} />
        ) : null}
      </CardHeader>
      <CardContent className={contentClassName}>{children}</CardContent>
    </Card>
  );
}

export function DashboardTableCardSkeleton({
  titleWidth = "w-24",
  controlsWidth = "w-[220px]",
  showControls = true,
  rows = 5,
  columns = 5,
}: {
  titleWidth?: string;
  controlsWidth?: string;
  showControls?: boolean;
  rows?: number;
  columns?: number;
}) {
  return (
    <DashboardCardSkeleton
      titleWidth={titleWidth}
      showDescription={false}
      contentClassName="space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Skeleton className={cn("h-5", titleWidth)} />
        {showControls ? (
          <Skeleton className={cn("h-8", controlsWidth)} />
        ) : null}
      </div>
      <div className="space-y-3">
        <div
          className="grid gap-3"
          style={{
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          }}
        >
          {Array.from({ length: columns }).map((_, index) => (
            <Skeleton key={index} className="h-3 w-full" />
          ))}
        </div>
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div
            key={rowIndex}
            className="grid gap-3"
            style={{
              gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            }}
          >
            {Array.from({ length: columns }).map((__, columnIndex) => (
              <Skeleton key={columnIndex} className="h-10 w-full" />
            ))}
          </div>
        ))}
      </div>
    </DashboardCardSkeleton>
  );
}

export function DashboardListSkeleton({
  items = 4,
  className,
}: {
  items?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-3", className)}>
      {Array.from({ length: items }).map((_, index) => (
        <div key={index} className="rounded-xl border p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-full max-w-md" />
            </div>
            <div className="flex shrink-0 gap-2">
              <Skeleton className="h-6 w-20" />
              <Skeleton className="h-6 w-16" />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-5 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}
