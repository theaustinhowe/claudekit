export const APP_NAME = "Inside";

export const SIZE_THRESHOLDS = {
  S: 100,
  M: 500,
  L: 1000,
} as const;

export function classifyPRSize(linesChanged: number): "S" | "M" | "L" | "XL" {
  if (linesChanged < SIZE_THRESHOLDS.S) return "S";
  if (linesChanged < SIZE_THRESHOLDS.M) return "M";
  if (linesChanged < SIZE_THRESHOLDS.L) return "L";
  return "XL";
}

export const SIZE_CLASSES: Record<string, string> = {
  S: "bg-size-s/15 text-size-s border-size-s/30",
  M: "bg-size-m/15 text-size-m border-size-m/30",
  L: "bg-size-l/15 text-size-l border-size-l/30",
  XL: "bg-size-xl/15 text-size-xl border-size-xl/30",
};

export const STATUS_COLORS: Record<string, string> = {
  Approved: "bg-status-success/15 text-status-success",
  "Changes Requested": "bg-status-warning/15 text-status-warning",
  Pending: "bg-muted text-muted-foreground",
  Merged: "bg-primary/15 text-primary",
  Draft: "bg-muted text-muted-foreground",
};

export const SEVERITY_COLORS: Record<string, string> = {
  blocking: "bg-status-error",
  suggestion: "bg-status-warning",
  nit: "bg-status-success",
};

export const SEVERITY_LABELS: Record<string, string> = {
  blocking: "Blocking",
  suggestion: "Suggestion",
  nit: "Nit",
};

export const TREND_ICONS: Record<string, string> = {
  Improving: "\u2191",
  "Needs attention": "\u2193",
  "New pattern": "\u2605",
  Flat: "\u2192",
};

export const RISK_CLASSES: Record<string, string> = {
  Low: "text-status-success",
  Medium: "text-status-warning",
  High: "text-status-error",
};

export const SUB_PR_COLORS = ["hsl(252, 80%, 60%)", "hsl(217, 91%, 60%)", "hsl(142, 71%, 45%)", "hsl(38, 92%, 50%)"];

export const FEEDBACK_CATEGORIES = [
  "Error Handling",
  "Test Coverage",
  "Naming Conventions",
  "Type Safety",
  "API Design",
  "Performance",
];
