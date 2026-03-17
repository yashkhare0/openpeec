import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { InlineEmpty } from "./EmptyState";

type MixItem = { type: string; share: number };

function titleCase(value: string): string {
  return value
    .split("_")
    .map((item) => item.charAt(0).toUpperCase() + item.slice(1).toLowerCase())
    .join(" ");
}

const typeColors: Record<string, string> = {
  ugc: "bg-amber-500",
  editorial: "bg-blue-500",
  corporate: "bg-violet-500",
  docs: "bg-emerald-500",
  news: "bg-rose-500",
};

export function SourceMixChart({ sourceMix }: { sourceMix: MixItem[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Domains by Type</CardTitle>
        <CardDescription>
          Most used domains categorized by type.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {sourceMix.length === 0 ? (
          <InlineEmpty text="No source mix data yet." />
        ) : (
          <div className="space-y-4">
            {/* Stacked bar preview */}
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
              {sourceMix.map((item) => (
                <div
                  key={item.type}
                  className={`h-full transition-all ${typeColors[item.type.toLowerCase()] ?? "bg-primary"}`}
                  style={{
                    width: `${Math.max(item.share, 1)}%`,
                  }}
                />
              ))}
            </div>

            {/* Legend + individual bars */}
            <div className="space-y-3">
              {sourceMix.map((item) => (
                <div key={item.type} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className={`size-2.5 rounded-full ${typeColors[item.type.toLowerCase()] ?? "bg-primary"}`}
                      />
                      <span className="text-sm text-muted-foreground">
                        {titleCase(item.type)}
                      </span>
                    </div>
                    <span className="text-sm font-medium tabular-nums">
                      {Math.round(item.share)}%
                    </span>
                  </div>
                  <Progress
                    value={Math.min(item.share, 100)}
                    className="h-2"
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
