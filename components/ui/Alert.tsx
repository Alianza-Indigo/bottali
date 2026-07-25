import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

export type AlertTone = "info" | "success" | "warning" | "danger";

const TONE_CLASSES: Record<AlertTone, string> = {
  info: "bg-brand-subtle text-ink border-brand/30",
  success: "bg-success-subtle text-ink border-success/30",
  warning: "bg-warning-subtle text-ink border-warning/30",
  danger: "bg-danger-subtle text-ink border-danger/30",
};

export function Alert({ tone = "info", className, role = "status", ...props }: HTMLAttributes<HTMLDivElement> & { tone?: AlertTone }) {
  return (
    <div
      role={tone === "danger" || tone === "warning" ? "alert" : role}
      className={cn("rounded-md border px-4 py-3 text-sm", TONE_CLASSES[tone], className)}
      {...props}
    />
  );
}
