import type { ReactNode } from "react";
import { ChevronDown, Filter } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type ListFilterOption<T extends string = string> = {
  value: T;
  label: string;
  disabled?: boolean;
};

export type ListFilterGroup<T extends string = string> = {
  label: string;
  values: T[];
  options: Array<ListFilterOption<T>>;
  onValuesChange: (values: T[]) => void;
};

export type ListFilterAction = {
  label: string;
  icon?: ReactNode;
  meta?: string;
  onSelect: () => void;
};

export function ListFilterDropdown({
  label,
  groups,
  actions = [],
}: {
  label: string;
  groups: Array<ListFilterGroup>;
  actions?: ListFilterAction[];
}) {
  const selectedCount = groups.reduce(
    (total, group) => total + group.values.length,
    0
  );
  const hasSelection = selectedCount > 0;
  const clearAll = () => {
    groups.forEach((group) => group.onValuesChange([]));
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={label}
          className="min-w-[112px] justify-start"
        >
          <Filter data-icon="inline-start" />
          {hasSelection ? `${selectedCount} Selected` : "Filters"}
          <ChevronDown data-icon="inline-end" className="ml-auto" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {groups.map((group, index) => (
          <div key={group.label}>
            {index > 0 ? <DropdownMenuSeparator /> : null}
            <DropdownMenuLabel>{group.label}</DropdownMenuLabel>
            <DropdownMenuGroup>
              {group.options.map((option) => {
                const checked = group.values.includes(option.value);
                return (
                  <DropdownMenuCheckboxItem
                    key={option.value}
                    checked={checked}
                    disabled={option.disabled}
                    onSelect={(event) => event.preventDefault()}
                    onCheckedChange={(nextChecked) => {
                      group.onValuesChange(
                        nextChecked
                          ? group.values.includes(option.value)
                            ? group.values
                            : [...group.values, option.value]
                          : group.values.filter(
                              (value) => value !== option.value
                            )
                      );
                    }}
                  >
                    {option.label}
                  </DropdownMenuCheckboxItem>
                );
              })}
            </DropdownMenuGroup>
          </div>
        ))}
        {hasSelection ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={clearAll}>
              Clear filters
            </DropdownMenuItem>
          </>
        ) : null}
        {actions.length ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              {actions.map((action) => (
                <DropdownMenuItem
                  key={action.label}
                  onSelect={action.onSelect}
                >
                  {action.icon}
                  <span>{action.label}</span>
                  {action.meta ? (
                    <span className="text-muted-foreground ml-auto tabular-nums">
                      {action.meta}
                    </span>
                  ) : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
