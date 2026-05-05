import type { BranchAuditAction } from "@/types/branch";

export function formatFieldName(field: string): string {
  // camelCase → Title Case: billingContactEmail → "Billing Contact Email"
  return field
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

export function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined) return "(empty)";
  if (typeof value === "string" && value.trim() === "") return "(empty)";
  return String(value);
}

export type ActionStyle = {
  label: string;
  bg: string;
  text: string;
  dot: string;
};

export function actionStyle(action: BranchAuditAction): ActionStyle {
  switch (action) {
    case "CREATE":
      return {
        label: "Created",
        bg: "bg-[#ECFDF5] text-[#15be53] green-pill",
        text: "text-[#15be53]",
        dot: "bg-[#15be53]",
      };
    case "UPDATE":
      return {
        label: "Updated",
        bg: "bg-[rgba(5,112,222,0.1)] text-[#0570DE] blue-pill",
        text: "text-[#0570DE]",
        dot: "bg-[#0570DE]",
      };
    case "DELETE":
      return {
        label: "Deleted",
        bg: "bg-[#FDE8EC] text-[#df1b41] red-pill",
        text: "text-[#df1b41]",
        dot: "bg-[#df1b41]",
      };
  }
}

export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const diffMs = now.getTime() - then.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? "" : "s"} ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? "" : "s"} ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;
  const diffMon = Math.floor(diffDay / 30);
  if (diffMon < 12) return `${diffMon} month${diffMon === 1 ? "" : "s"} ago`;
  const diffYr = Math.floor(diffMon / 12);
  return `${diffYr} year${diffYr === 1 ? "" : "s"} ago`;
}
