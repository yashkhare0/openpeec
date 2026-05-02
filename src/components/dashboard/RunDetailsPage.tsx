import type { Id } from "../../../convex/_generated/dataModel";

import { ResponseDetailPage } from "./ResponseDetailPage";

export function RunDetailsPage({
  runDetail,
  onOpenPrompt,
}: {
  runDetail: React.ComponentProps<typeof ResponseDetailPage>["runDetail"];
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
      onOpenPrompt={promptId ? () => onOpenPrompt(promptId) : undefined}
    />
  );
}
