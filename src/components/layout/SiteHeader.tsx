import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
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

export function SiteHeader({
  rangeDays,
  onRangeDays,
  modelFilter,
  onModelFilter,
  modelOptions,
  breadcrumbs,
}: {
  rangeDays: number;
  onRangeDays: (value: number) => void;
  modelFilter: string;
  onModelFilter: (value: string) => void;
  modelOptions: ModelOption[];
  breadcrumbs?: Array<{ label: string; onClick?: () => void }>;
}) {
  return (
    <header className="bg-background flex min-h-14 shrink-0 items-center gap-2 border-b px-4 py-2">
      <SidebarTrigger className="-ml-1 self-start sm:self-center" />
      <Separator orientation="vertical" className="mr-2 hidden h-4 sm:block" />

      <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          {breadcrumbs?.length ? (
            <Breadcrumb>
              <BreadcrumbList>
                {breadcrumbs.map((item, index) => {
                  const isLast = index === breadcrumbs.length - 1;
                  return (
                    <div key={`${item.label}-${index}`} className="contents">
                      <BreadcrumbItem>
                        {isLast || !item.onClick ? (
                          <BreadcrumbPage>{item.label}</BreadcrumbPage>
                        ) : (
                          <BreadcrumbLink asChild>
                            <button type="button" onClick={item.onClick}>
                              {item.label}
                            </button>
                          </BreadcrumbLink>
                        )}
                      </BreadcrumbItem>
                      {!isLast ? <BreadcrumbSeparator /> : null}
                    </div>
                  );
                })}
              </BreadcrumbList>
            </Breadcrumb>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
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
              {modelOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </header>
  );
}
