import type { Id } from "../../../convex/_generated/dataModel";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { InlineEmpty } from "./components/EmptyState";

type TrackedKind = "brand" | "competitor" | "product" | "feature" | "other";

function titleCase(value: string): string {
  return value
    .split("_")
    .map((item) => item.charAt(0).toUpperCase() + item.slice(1).toLowerCase())
    .join(" ");
}

function formatPercent(value: number | undefined): string {
  if (value === undefined) return "-";
  return `${Math.round(value)}%`;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Action failed.";
}

const typeColors: Record<string, string> = {
  ugc: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300",
  editorial: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  corporate: "bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-300",
  docs: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300",
  news: "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-300",
};

export function SourcesPage({
  sources,
  entities,
  newEntityName,
  onNewEntityName,
  newEntityKind,
  onNewEntityKind,
  newEntityDomain,
  onNewEntityDomain,
  onCreateEntity,
  onUpdateEntity,
  onDeleteEntity,
  onNotice,
}: {
  sources: Array<{
    domain: string;
    type: string;
    usedShare: number;
    avgCitationsPerRun: number;
    avgQualityScore?: number;
    avgPosition?: number;
    ownedShare: number;
  }>;
  entities: Array<{
    _id: Id<"trackedEntities">;
    name: string;
    kind: TrackedKind;
    ownedDomains?: string[];
    active: boolean;
  }>;
  newEntityName: string;
  onNewEntityName: (value: string) => void;
  newEntityKind: TrackedKind;
  onNewEntityKind: (value: TrackedKind) => void;
  newEntityDomain: string;
  onNewEntityDomain: (value: string) => void;
  onCreateEntity: (args: {
    name: string;
    kind: TrackedKind;
    ownedDomains?: string[];
  }) => Promise<Id<"trackedEntities">>;
  onUpdateEntity: (args: {
    id: Id<"trackedEntities">;
    name?: string;
    active?: boolean;
  }) => Promise<Id<"trackedEntities">>;
  onDeleteEntity: (args: {
    id: Id<"trackedEntities">;
  }) => Promise<Id<"trackedEntities">>;
  onNotice: (text: string) => void;
}) {
  const createEntity = async () => {
    if (!newEntityName.trim()) return onNotice("Entity name is required.");
    const ownedDomains = newEntityDomain
      .split(",")
      .map((d) => d.trim())
      .filter(Boolean);
    try {
      await onCreateEntity({
        name: newEntityName.trim(),
        kind: newEntityKind,
        ownedDomains: ownedDomains.length ? ownedDomains : undefined,
      });
      onNewEntityName("");
      onNewEntityDomain("");
      onNotice("Tracked entity created.");
    } catch (error) {
      onNotice(errorMessage(error));
    }
  };

  const renameEntity = async (
    id: Id<"trackedEntities">,
    currentName: string
  ) => {
    const next = window.prompt("New entity name", currentName);
    if (!next || next.trim() === currentName) return;
    try {
      await onUpdateEntity({ id, name: next.trim() });
      onNotice("Tracked entity updated.");
    } catch (error) {
      onNotice(errorMessage(error));
    }
  };

  return (
    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      <div className="grid gap-4 px-4 xl:grid-cols-[1fr_360px] lg:px-6">
        <Card>
          <CardHeader>
            <CardTitle>Sources</CardTitle>
            <CardDescription>
              Domains ranked by usage and citation quality.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {sources.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Domain</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Used</TableHead>
                    <TableHead className="text-right">Avg cites/run</TableHead>
                    <TableHead className="text-right">Quality</TableHead>
                    <TableHead className="text-right">Position</TableHead>
                    <TableHead className="text-right">Owned share</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sources.map((s) => (
                    <TableRow key={s.domain}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="flex size-6 items-center justify-center rounded bg-muted">
                            <img
                              src={`https://www.google.com/s2/favicons?domain=${s.domain}&sz=32`}
                              alt=""
                              className="size-4 rounded-sm"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display =
                                  "none";
                              }}
                            />
                          </div>
                          <span className="font-medium">{s.domain}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={typeColors[s.type.toLowerCase()] ?? ""}
                        >
                          {titleCase(s.type)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatPercent(s.usedShare)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {s.avgCitationsPerRun.toFixed(1)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {s.avgQualityScore !== undefined
                          ? Math.round(s.avgQualityScore)
                          : "-"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {s.avgPosition !== undefined
                          ? `#${s.avgPosition.toFixed(1)}`
                          : "-"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatPercent(s.ownedShare)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <InlineEmpty text="No source analytics available yet." />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tracked Entities</CardTitle>
            <CardDescription>
              Maintain brand and competitor coverage targets.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 rounded-lg border bg-muted/30 p-3">
              <Input
                value={newEntityName}
                onChange={(e) => onNewEntityName(e.target.value)}
                placeholder="Entity name"
                className="h-8"
              />
              <Select
                value={newEntityKind}
                onValueChange={(v) => onNewEntityKind(v as TrackedKind)}
              >
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["brand", "competitor", "product", "feature", "other"].map(
                    (k) => (
                      <SelectItem key={k} value={k}>
                        {titleCase(k)}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
              <Input
                value={newEntityDomain}
                onChange={(e) => onNewEntityDomain(e.target.value)}
                placeholder="Owned domains (comma-separated)"
                className="h-8"
              />
              <Button size="sm" onClick={() => void createEntity()}>
                Add entity
              </Button>
            </div>

            {entities.length === 0 ? (
              <InlineEmpty text="No tracked entities yet." />
            ) : (
              entities.map((entity) => (
                <div
                  key={String(entity._id)}
                  className="rounded-lg border p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{entity.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {titleCase(entity.kind)} |{" "}
                        {(entity.ownedDomains ?? []).join(", ") || "No domains"}
                      </p>
                    </div>
                    <Badge
                      variant={entity.active ? "default" : "secondary"}
                      className={cn(
                        entity.active
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300"
                          : ""
                      )}
                    >
                      {entity.active ? "Active" : "Paused"}
                    </Badge>
                  </div>
                  <div className="mt-2 flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() =>
                        void renameEntity(entity._id, entity.name)
                      }
                    >
                      Rename
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() =>
                        void onUpdateEntity({
                          id: entity._id,
                          active: !entity.active,
                        })
                          .then(() =>
                            onNotice(
                              entity.active
                                ? "Entity paused."
                                : "Entity resumed."
                            )
                          )
                          .catch((e: unknown) => onNotice(errorMessage(e)))
                      }
                    >
                      {entity.active ? "Pause" : "Resume"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-destructive"
                      onClick={() =>
                        void onDeleteEntity({ id: entity._id })
                          .then(() => onNotice("Entity deleted."))
                          .catch((e: unknown) => onNotice(errorMessage(e)))
                      }
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
