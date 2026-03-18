import type { Id } from "../../../convex/_generated/dataModel";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { InlineEmpty } from "./components/EmptyState";

type PromptRow = {
  _id: Id<"prompts">;
  groupId?: Id<"promptGroups">;
  name: string;
  promptText: string;
  targetModel: string;
  active: boolean;
};

type GroupCard = {
  key: string;
  id: Id<"promptGroups"> | "all";
  name: string;
  description?: string;
  prompts: PromptRow[];
};

export function GroupsPage({
  loading = false,
  groups,
  prompts,
  onOpenPrompt,
  onAddMore,
}: {
  loading?: boolean;
  groups: Array<{
    _id: Id<"promptGroups">;
    name: string;
    description?: string;
  }>;
  prompts: PromptRow[];
  onOpenPrompt: (promptId: Id<"prompts">) => void;
  onAddMore: (groupId: Id<"promptGroups"> | "all") => void;
}) {
  const cards: GroupCard[] = groups.map((group) => ({
    key: String(group._id),
    id: group._id,
    name: group.name,
    description: group.description,
    prompts: prompts.filter((prompt) => prompt.groupId === group._id),
  }));

  const ungroupedPrompts = prompts.filter((prompt) => !prompt.groupId);
  if (ungroupedPrompts.length > 0) {
    cards.push({
      key: "ungrouped",
      id: "all",
      name: "Ungrouped",
      description: "Prompts not assigned to a group yet.",
      prompts: ungroupedPrompts,
    });
  }

  return (
    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      <div className="px-4 lg:px-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Groups</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Organize prompts into reusable monitoring sets.
          </p>
        </div>
      </div>

      <div className="grid gap-4 px-4 lg:px-6 xl:grid-cols-2 2xl:grid-cols-3">
        {loading ? (
          Array.from({ length: 6 }).map((_, index) => (
            <Card key={index} className="overflow-hidden shadow-none">
              <CardContent className="space-y-4 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-28" />
                    <Skeleton className="h-4 w-36" />
                  </div>
                  <Skeleton className="h-8 w-20" />
                </div>
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((__, rowIndex) => (
                    <div
                      key={rowIndex}
                      className="flex items-center justify-between rounded-lg border px-3 py-2"
                    >
                      <Skeleton className="h-4 w-36" />
                      <Skeleton className="h-5 w-14" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))
        ) : cards.length === 0 ? (
          <div className="xl:col-span-2 2xl:col-span-3">
            <InlineEmpty text="No prompt groups yet. Create prompts or groups from the Prompts page first." />
          </div>
        ) : (
          cards.map((group) => (
            <Card key={group.key} className="overflow-hidden shadow-none">
              <CardContent className="space-y-4 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">{group.name}</CardTitle>
                    <p className="text-muted-foreground mt-1 text-sm">
                      {group.description || `${group.prompts.length} prompts`}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onAddMore(group.id)}
                  >
                    Add more
                  </Button>
                </div>

                {group.prompts.length === 0 ? (
                  <InlineEmpty text="No prompts in this group yet." />
                ) : (
                  <div className="space-y-1.5">
                    {group.prompts.map((prompt) => (
                      <button
                        key={String(prompt._id)}
                        type="button"
                        onClick={() => onOpenPrompt(prompt._id)}
                        className="hover:bg-muted/30 flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left transition-colors"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {prompt.name}
                          </p>
                          {!prompt.active ? (
                            <Badge variant="outline" className="mt-1">
                              Paused
                            </Badge>
                          ) : null}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
