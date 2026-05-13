import { cn } from "@/lib/utils";
import { statusTone, type StatusTone } from "@/lib/statusTone";

type Variant = "default" | "warning" | "success" | "error";

const VARIANT_TO_TONE: Record<Variant, StatusTone | "neutral"> = {
  default: "neutral",
  warning: "warning",
  success: "success",
  error: "danger",
};

export function StatusBanner({
  text,
  variant = "default",
}: {
  text: string;
  variant?: Variant;
}) {
  const tone = VARIANT_TO_TONE[variant];
  return (
    <div
      className={cn(
        "rounded-lg border px-4 py-2.5 text-sm",
        statusTone(tone as StatusTone, "subtle")
      )}
    >
      {text}
    </div>
  );
}
