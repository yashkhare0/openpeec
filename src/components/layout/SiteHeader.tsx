import { useEffect, useRef, useState, type ReactNode } from "react";
import { Search, XIcon } from "lucide-react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type RangeOption = { label: string; days: number };
type ProviderOption = { label: string; value: string };

const rangeOptions: RangeOption[] = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];

export function SiteHeader({
  rangeDays,
  onRangeDays,
  providerFilter,
  onProviderFilter,
  providerOptions,
  showRangeFilter = true,
  showProviderFilter = true,
  searchValue,
  onSearchValue,
  searchPlaceholder = "Search...",
  action,
  breadcrumbs,
}: {
  rangeDays: number;
  onRangeDays: (value: number) => void;
  providerFilter: string;
  onProviderFilter: (value: string) => void;
  providerOptions: ProviderOption[];
  showRangeFilter?: boolean;
  showProviderFilter?: boolean;
  searchValue?: string;
  onSearchValue?: (value: string) => void;
  searchPlaceholder?: string;
  action?: ReactNode;
  breadcrumbs?: Array<{ label: string; onClick?: () => void }>;
}) {
  const [searchOpen, setSearchOpen] = useState(Boolean(searchValue));
  const inputRef = useRef<HTMLInputElement>(null);
  const hasSearch = onSearchValue !== undefined;

  useEffect(() => {
    if (searchValue) {
      setSearchOpen(true);
    }
  }, [searchValue]);

  useEffect(() => {
    if (searchOpen) {
      inputRef.current?.focus();
    }
  }, [searchOpen]);

  const openSearch = () => {
    setSearchOpen(true);
  };

  const clearSearch = () => {
    onSearchValue?.("");
    if (!searchValue) {
      setSearchOpen(false);
      return;
    }
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  return (
    <header className="bg-background flex min-h-14 shrink-0 items-center gap-2 border-b px-4 py-2">
      <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          {breadcrumbs?.length ? (
            <Breadcrumb className="min-w-0">
              <BreadcrumbList className="min-w-0 flex-nowrap overflow-hidden">
                {breadcrumbs.map((item, index) => {
                  const isLast = index === breadcrumbs.length - 1;
                  return (
                    <div key={`${item.label}-${index}`} className="contents">
                      <BreadcrumbItem
                        className={cn(
                          "min-w-0",
                          index === 0 ? "shrink-0" : "flex-1"
                        )}
                      >
                        {isLast || !item.onClick ? (
                          <BreadcrumbPage
                            className="block truncate"
                            title={item.label}
                          >
                            {item.label}
                          </BreadcrumbPage>
                        ) : (
                          <BreadcrumbLink
                            asChild
                            className="block min-w-0 truncate"
                          >
                            <button
                              type="button"
                              title={item.label}
                              onClick={item.onClick}
                            >
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

        <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
          {hasSearch ? (
            <div className="flex items-center">
              {searchOpen ? (
                <div className="relative">
                  <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
                  <Input
                    ref={inputRef}
                    value={searchValue ?? ""}
                    onChange={(event) => onSearchValue?.(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        if (searchValue) {
                          onSearchValue?.("");
                        } else {
                          setSearchOpen(false);
                        }
                      }
                    }}
                    placeholder={searchPlaceholder}
                    className="h-8 w-[220px] pr-8 pl-8"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="absolute top-1/2 right-1 -translate-y-1/2"
                    onClick={clearSearch}
                  >
                    <XIcon />
                    <span className="sr-only">Clear search</span>
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={openSearch}
                >
                  <Search />
                  <span className="sr-only">Search prompts</span>
                </Button>
              )}
            </div>
          ) : null}

          {action}

          {showRangeFilter ? (
            <Select
              value={rangeDays.toString()}
              onValueChange={(v) => onRangeDays(Number(v))}
            >
              <SelectTrigger className="h-8 w-[76px]">
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
          ) : null}

          {showProviderFilter ? (
            <Select value={providerFilter} onValueChange={onProviderFilter}>
              <SelectTrigger className="h-8 w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {providerOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </div>
      </div>
    </header>
  );
}
