import type { Id } from "../../../convex/_generated/dataModel";

import { ResponseDetailPage } from "./ResponseDetailPage";

export function RunDetailsPage({
  runDetail,
  backLabel,
  onBack,
  onOpenPrompt,
}: {
  runDetail: React.ComponentProps<typeof ResponseDetailPage>["runDetail"];
  backLabel: string;
  onBack: () => void;
  onOpenPrompt: (promptId: Id<"prompts">) => void;
}) {
  const promptId =
    runDetail?.run &&
    "promptId" in runDetail.run &&
    runDetail.run.promptId &&
    typeof runDetail.run.promptId === "string"
      ? runDetail.run.promptId
      : null;

  return (
    <ResponseDetailPage
      runDetail={runDetail}
      onBack={onBack}
      backLabel={backLabel}
      onOpenPrompt={promptId ? () => onOpenPrompt(promptId) : undefined}
    />
  );
}
