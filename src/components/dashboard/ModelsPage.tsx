import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "./components/EmptyState";

function formatPercent(value: number | undefined): string {
  if (value === undefined) return "-";
  return `${Math.round(value)}%`;
}

export function ModelsPage({
  rows,
  onOpenSettings,
}: {
  rows: Array<{
    model: string;
    visibility: number | undefined;
    citation: number | undefined;
    position: number | undefined;
    runSuccess: number | undefined;
  }>;
  onOpenSettings: () => Promise<void>;
}) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <div className="px-4 lg:px-6">
          <EmptyState
            title="No model analytics yet"
            description="Once real prompt runs are ingested, model-level visibility and citation comparisons will appear here."
            actionLabel="Review runner setup"
            onAction={onOpenSettings}
            compact
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      <div className="px-4 lg:px-6">
        <Card>
          <CardHeader>
            <CardTitle>Models</CardTitle>
            <CardDescription>
              Visibility and citation quality matrix.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Model</TableHead>
                  <TableHead className="text-right">Visibility</TableHead>
                  <TableHead className="text-right">Citation</TableHead>
                  <TableHead className="text-right">Avg Position</TableHead>
                  <TableHead className="text-right">Run Success</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.model}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="flex size-7 items-center justify-center rounded-md bg-muted text-xs font-bold">
                          {row.model.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium">{row.model}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPercent(row.visibility)}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.citation !== undefined ? (
                        <div className="flex items-center justify-end gap-2">
                          <div className="h-1.5 w-12 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-primary"
                              style={{
                                width: `${Math.min(100, row.citation)}%`,
                              }}
                            />
                          </div>
                          <span className="tabular-nums">
                            {Math.round(row.citation)}
                          </span>
                        </div>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.position !== undefined ? (
                        <Badge variant="secondary" className="tabular-nums">
                          #{row.position.toFixed(1)}
                        </Badge>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPercent(row.runSuccess)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
