import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";

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
import { cn } from "@/lib/utils";
import { InlineEmpty } from "./EmptyState";

type ModelRow = {
  model: string;
  visibility: number | undefined;
  citationQuality: number | undefined;
  averagePosition: number | undefined;
  deltaVisibility: number | undefined;
};

export function CompetitorTable({ rows }: { rows: ModelRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Model Comparison</CardTitle>
        <CardDescription>
          Compare models by visibility and citation quality.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <InlineEmpty text="No model comparison data yet." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">#</TableHead>
                <TableHead>Model</TableHead>
                <TableHead className="text-right">Visibility</TableHead>
                <TableHead className="text-right">Sentiment</TableHead>
                <TableHead className="text-right">Position</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, i) => (
                <TableRow key={row.model}>
                  <TableCell className="text-muted-foreground">
                    {i + 1}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="flex size-7 items-center justify-center rounded-md bg-muted text-xs font-bold">
                        {row.model.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-medium">{row.model}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    {row.visibility !== undefined ? (
                      <div className="flex items-center justify-end gap-2">
                        <span className="font-medium tabular-nums">
                          {Math.round(row.visibility)}%
                        </span>
                        <DeltaIndicator value={row.deltaVisibility} />
                      </div>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      {row.citationQuality !== undefined ? (
                        <>
                          <div className="h-1.5 w-12 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-primary"
                              style={{
                                width: `${Math.min(100, row.citationQuality)}%`,
                              }}
                            />
                          </div>
                          <span className="font-medium tabular-nums">
                            {Math.round(row.citationQuality)}
                          </span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    {row.averagePosition !== undefined ? (
                      <Badge variant="secondary" className="tabular-nums">
                        #{row.averagePosition.toFixed(1)}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function DeltaIndicator({ value }: { value: number | undefined }) {
  if (value === undefined || Math.abs(value) < 0.1) {
    return (
      <span className="inline-flex items-center text-xs text-muted-foreground">
        <Minus className="size-3" />
      </span>
    );
  }
  const isPositive = value > 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-medium",
        isPositive
           ? "text-emerald-600 dark:text-emerald-300"
          : "text-rose-600 dark:text-rose-300"
      )}
    >
      {isPositive ? (
        <ArrowUpRight className="size-3" />
      ) : (
        <ArrowDownRight className="size-3" />
      )}
      {Math.abs(value).toFixed(1)}
    </span>
  );
}
