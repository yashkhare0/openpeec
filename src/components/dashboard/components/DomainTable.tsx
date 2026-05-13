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
import { sourceTypeToneClass } from "@/lib/statusTone";
import { InlineEmpty } from "./EmptyState";

type SourceRow = {
  domain: string;
  type: string;
  usedShare: number;
  avgCitationsPerRun: number;
  avgQualityScore: number | undefined;
};

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

export function DomainTable({ sources }: { sources: SourceRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Top Domains</CardTitle>
        <CardDescription>Citation quality and usage by domain.</CardDescription>
      </CardHeader>
      <CardContent>
        {sources.length === 0 ? (
          <InlineEmpty text="No domain data yet." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">#</TableHead>
                <TableHead>Domain</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Used</TableHead>
                <TableHead className="text-right">Avg. Citations</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sources.slice(0, 8).map((source, i) => (
                <TableRow key={source.domain}>
                  <TableCell className="text-muted-foreground">
                    {i + 1}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="bg-muted flex size-6 items-center justify-center rounded">
                        <img
                          src={`https://www.google.com/s2/favicons?domain=${source.domain}&sz=32`}
                          alt=""
                          className="size-4 rounded-sm"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display =
                              "none";
                          }}
                        />
                      </div>
                      <span className="font-medium">{source.domain}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={sourceTypeToneClass(source.type)}
                    >
                      {titleCase(source.type)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPercent(source.usedShare)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {source.avgCitationsPerRun.toFixed(1)}
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
