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
  actionLabel: string;
  onAction: () => Promise<void>;
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
        <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted">
          <InboxIcon className="size-6 text-muted-foreground" />
        </div>
        <h3 className="text-base font-semibold">{title}</h3>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          {description}
        </p>
        <Button className="mt-4" onClick={() => void onAction()}>
          {actionLabel}
        </Button>
      </CardContent>
    </Card>
  );
}

export function InlineEmpty({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}
