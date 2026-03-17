import { ColumnDef } from "@tanstack/react-table";
import { Id, Doc } from "convex/_generated/dataModel";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { CaretSortIcon } from "@radix-ui/react-icons";

import { api } from "../../convex/_generated/api";
import { DataTable } from "./DataTable";
import { Register } from "./Register";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";

type MonitorDoc = Doc<"monitors">;

const columns: ColumnDef<MonitorDoc>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && "indeterminate")
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "name",
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Monitor
        <CaretSortIcon className="ml-2 h-4 w-4" />
      </Button>
    ),
  },
  {
    accessorKey: "platform",
    header: "Platform",
    cell: ({ row }) => row.original.platform.toUpperCase(),
  },
  {
    accessorKey: "schedule",
    header: "Schedule",
    cell: ({ row }) => row.original.schedule || "Manual only",
  },
  {
    accessorKey: "enabled",
    header: "State",
    cell: ({ row }) => (
      <span
        className={
          row.original.enabled
            ? "rounded-full bg-emerald-500/10 px-2 py-1 text-xs text-emerald-700 dark:text-emerald-300"
            : "rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground"
        }
      >
        {row.original.enabled ? "enabled" : "disabled"}
      </span>
    ),
  },
  {
    accessorKey: "client",
    header: "Client",
    cell: () => "chatgpt",
  },
];

export function Crons() {
  const { isAuthenticated } = useConvexAuth();
  const monitors =
    useQuery(api.monitoring.listMonitors, isAuthenticated ? {} : "skip") ?? [];
  const deleteMonitor = useMutation(api.monitoring.deleteMonitor);

  async function deleteBatch(ids: string[]) {
    await Promise.all(
      ids.map((id) => deleteMonitor({ id: id as Id<"monitors"> }))
    );
  }

  return (
    <div className="w-full">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Monitors</CardTitle>
          <CardDescription>
            ChatGPT-first monitor definitions used by the local runner.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Register />
          <DataTable
            columns={columns}
            data={monitors}
            visibility={{}}
            getRowId={(row) => row._id}
            deleteBatch={deleteBatch}
            filterColumn="name"
            filterPlaceholder="Filter monitor names..."
          />
        </CardContent>
      </Card>
    </div>
  );
}
