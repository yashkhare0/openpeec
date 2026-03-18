import { cn } from "@/lib/utils";

export function StatusBanner({
  text,
  variant = "default",
}: {
  text: string;
  variant?: "default" | "warning" | "success" | "error";
}) {
  return (
    <div
      className={cn(
        "rounded-lg border px-4 py-2.5 text-sm",
        variant === "default" && "bg-muted/50 text-muted-foreground",
        variant === "warning" &&
          "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300",
        variant === "success" &&
          "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
        variant === "error" &&
          "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300"
      )}
    >
      {text}
    </div>
  );
}
