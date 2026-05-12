import type { ReactNode } from "react";
import type { Id } from "../../../../convex/_generated/dataModel";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  promptFunnelStageOptions,
  promptGeneratedByOptions,
  promptIntentCategoryOptions,
  promptPriorityOptions,
  promptReviewStateOptions,
  promptSentimentLensOptions,
  type PromptFunnelStage,
  type PromptGeneratedBy,
  type PromptIntentCategory,
  type PromptPriority,
  type PromptReviewState,
  type PromptSentimentLens,
} from "@/lib/prompt-categorisation";

const NONE_VALUE = "__none__";

export type PromptEntityOption = {
  _id: Id<"trackedEntities">;
  name: string;
  active: boolean;
};

export type PromptGroupOption = {
  _id: Id<"promptGroups">;
  name: string;
  entityId?: Id<"trackedEntities">;
  active: boolean;
};

export type PromptCategorisationValue = {
  entityId?: Id<"trackedEntities">;
  promptGroupId?: Id<"promptGroups">;
  intentCategory: PromptIntentCategory;
  sentimentLens: PromptSentimentLens;
  funnelStage?: PromptFunnelStage;
  audience: string;
  topic: string;
  priority?: PromptPriority;
  reviewState: PromptReviewState;
  generatedBy: PromptGeneratedBy;
  generationRationale: string;
  sourceUrlsText: string;
  active: boolean;
};

function SelectField({
  id,
  label,
  value,
  placeholder,
  children,
  onValueChange,
}: {
  id: string;
  label: string;
  value: string;
  placeholder?: string;
  children: ReactNode;
  onValueChange: (value: string) => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>{children}</SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}

export function PromptCategorisationFields({
  value,
  entities,
  promptGroups,
  onChange,
}: {
  value: PromptCategorisationValue;
  entities: PromptEntityOption[];
  promptGroups: PromptGroupOption[];
  onChange: (value: PromptCategorisationValue) => void;
}) {
  const visibleGroups = promptGroups.filter(
    (group) =>
      group.active &&
      (!value.entityId || !group.entityId || group.entityId === value.entityId)
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-2">
        <SelectField
          id="prompt-entity"
          label="Entity"
          value={value.entityId ?? NONE_VALUE}
          placeholder="No entity"
          onValueChange={(nextValue) =>
            onChange({
              ...value,
              entityId:
                nextValue === NONE_VALUE
                  ? undefined
                  : (nextValue as Id<"trackedEntities">),
              promptGroupId:
                nextValue === NONE_VALUE ? undefined : value.promptGroupId,
            })
          }
        >
          <SelectItem value={NONE_VALUE}>No entity</SelectItem>
          {entities
            .filter((entity) => entity.active)
            .map((entity) => (
              <SelectItem key={String(entity._id)} value={entity._id}>
                {entity.name}
              </SelectItem>
            ))}
        </SelectField>

        <SelectField
          id="prompt-group"
          label="Prompt group"
          value={value.promptGroupId ?? NONE_VALUE}
          placeholder="No group"
          onValueChange={(nextValue) =>
            onChange({
              ...value,
              promptGroupId:
                nextValue === NONE_VALUE
                  ? undefined
                  : (nextValue as Id<"promptGroups">),
            })
          }
        >
          <SelectItem value={NONE_VALUE}>No group</SelectItem>
          {visibleGroups.map((group) => (
            <SelectItem key={String(group._id)} value={group._id}>
              {group.name}
            </SelectItem>
          ))}
        </SelectField>

        <SelectField
          id="prompt-intent"
          label="Intent"
          value={value.intentCategory}
          onValueChange={(nextValue) =>
            onChange({
              ...value,
              intentCategory: nextValue as PromptIntentCategory,
            })
          }
        >
          {promptIntentCategoryOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectField>

        <SelectField
          id="prompt-sentiment-lens"
          label="Sentiment lens"
          value={value.sentimentLens}
          onValueChange={(nextValue) =>
            onChange({
              ...value,
              sentimentLens: nextValue as PromptSentimentLens,
            })
          }
        >
          {promptSentimentLensOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectField>

        <SelectField
          id="prompt-funnel-stage"
          label="Funnel stage"
          value={value.funnelStage ?? NONE_VALUE}
          onValueChange={(nextValue) =>
            onChange({
              ...value,
              funnelStage:
                nextValue === NONE_VALUE
                  ? undefined
                  : (nextValue as PromptFunnelStage),
            })
          }
        >
          <SelectItem value={NONE_VALUE}>None</SelectItem>
          {promptFunnelStageOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectField>

        <SelectField
          id="prompt-priority"
          label="Priority"
          value={value.priority ?? NONE_VALUE}
          onValueChange={(nextValue) =>
            onChange({
              ...value,
              priority:
                nextValue === NONE_VALUE
                  ? undefined
                  : (nextValue as PromptPriority),
            })
          }
        >
          <SelectItem value={NONE_VALUE}>None</SelectItem>
          {promptPriorityOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectField>

        <SelectField
          id="prompt-review-state"
          label="Review state"
          value={value.reviewState}
          onValueChange={(nextValue) =>
            onChange({
              ...value,
              reviewState: nextValue as PromptReviewState,
            })
          }
        >
          {promptReviewStateOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectField>

        <SelectField
          id="prompt-generated-by"
          label="Source"
          value={value.generatedBy}
          onValueChange={(nextValue) =>
            onChange({
              ...value,
              generatedBy: nextValue as PromptGeneratedBy,
            })
          }
        >
          {promptGeneratedByOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectField>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor="prompt-audience">Audience</Label>
          <Input
            id="prompt-audience"
            value={value.audience}
            onChange={(event) =>
              onChange({ ...value, audience: event.target.value })
            }
            placeholder="SEO managers, founders, buyers..."
          />
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor="prompt-topic">Topic</Label>
          <Input
            id="prompt-topic"
            value={value.topic}
            onChange={(event) =>
              onChange({ ...value, topic: event.target.value })
            }
            placeholder="AI visibility, citation quality..."
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
        <div className="flex min-w-0 flex-col gap-1">
          <Label htmlFor="prompt-active">Active</Label>
          <p className="text-muted-foreground text-sm">
            Active approved prompts are eligible for group and entity runs.
          </p>
        </div>
        <Switch
          id="prompt-active"
          checked={value.active}
          onCheckedChange={(checked) => onChange({ ...value, active: checked })}
        />
      </div>

      <div className="flex min-w-0 flex-col gap-2">
        <Label htmlFor="prompt-rationale">Generation rationale</Label>
        <Textarea
          id="prompt-rationale"
          value={value.generationRationale}
          onChange={(event) =>
            onChange({ ...value, generationRationale: event.target.value })
          }
          rows={3}
        />
      </div>

      <div className="flex min-w-0 flex-col gap-2">
        <Label htmlFor="prompt-source-urls">Source URLs</Label>
        <Textarea
          id="prompt-source-urls"
          value={value.sourceUrlsText}
          onChange={(event) =>
            onChange({ ...value, sourceUrlsText: event.target.value })
          }
          placeholder="One URL per line"
          rows={3}
        />
      </div>
    </div>
  );
}
