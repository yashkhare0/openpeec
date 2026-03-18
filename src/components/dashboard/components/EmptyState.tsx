import { InboxIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  compact,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
}) {
  return (
    <Card>
      <CardContent
        className={cn(
          "flex flex-col items-center justify-center text-center",
          compact ? "py-8" : "py-16"
        )}
      >
        <div className="bg-muted mb-4 flex size-12 items-center justify-center rounded-full">
          <InboxIcon className="text-muted-foreground size-6" />
        </div>
        <h3 className="text-base font-semibold">{title}</h3>
        <p className="text-muted-foreground mt-1 max-w-md text-sm">
          {description}
        </p>
        {actionLabel && onAction && (
          <Button className="mt-4" onClick={onAction}>
            {actionLabel}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export function InlineEmpty({ text }: { text: string }) {
  return (
    <div className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
      {text}
    </div>
  );
}
