import { GraduationCap, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

type RangeOption = { label: string; days: number };
type ModelOption = { label: string; value: string };

const rangeOptions: RangeOption[] = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
];

const modelFilterOptions: ModelOption[] = [
  { label: "All Models", value: "all" },
  { label: "GPT-5", value: "gpt-5" },
  { label: "GPT-4.1", value: "gpt-4.1" },
  { label: "o3", value: "o3" },
  { label: "ChatGPT web", value: "chatgpt-web" },
];

export function SiteHeader({
  rangeDays,
  onRangeDays,
  modelFilter,
  onModelFilter,
  onRefresh,
  onStartTutorial,
}: {
  rangeDays: number;
  onRangeDays: (value: number) => void;
  modelFilter: string;
  onModelFilter: (value: string) => void;
  onRefresh: () => void;
  onStartTutorial: () => void;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4" />

      <div data-tour="header-filters" className="flex flex-1 items-center gap-2">
        <div data-tour="client-badge" className="flex items-center gap-1.5 rounded-lg border bg-muted/50 px-2.5 py-1 text-sm font-medium">
          <div className="size-2 rounded-full bg-primary" />
          ChatGPT
        </div>

        <Select
          value={rangeDays.toString()}
          onValueChange={(v) => onRangeDays(Number(v))}
        >
          <SelectTrigger className="h-8 w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {rangeOptions.map((opt) => (
              <SelectItem key={opt.days} value={opt.days.toString()}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={modelFilter} onValueChange={onModelFilter}>
          <SelectTrigger className="h-8 w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {modelFilterOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={onRefresh}
        >
          <RefreshCw className="size-4" />
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <Button data-tour="tutorial-btn" variant="outline" size="sm" onClick={onStartTutorial}>
          <GraduationCap className="mr-1.5 size-4" />
          Run Tutorial
        </Button>
      </div>
    </header>
  );
}
