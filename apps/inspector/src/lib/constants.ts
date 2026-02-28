export const APP_NAME = "Inspector";

// --- Session Constants (re-exported from shared package) ---

export {
  SESSION_EVENT_BUFFER_SIZE,
  SESSION_HEARTBEAT_INTERVAL_MS,
  SESSION_LOG_FLUSH_INTERVAL_MS,
} from "@claudekit/session";

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

/** Palette for skill groups — cycled by index. Each entry is an HSL string usable in style props. */
export const GROUP_COLORS = [
  "hsl(252, 80%, 60%)", // violet
  "hsl(199, 89%, 48%)", // sky blue
  "hsl(142, 71%, 45%)", // emerald
  "hsl(25, 95%, 53%)", // orange
  "hsl(330, 81%, 60%)", // pink
  "hsl(45, 93%, 47%)", // amber
  "hsl(173, 80%, 40%)", // teal
  "hsl(280, 68%, 55%)", // purple
];

export const FEEDBACK_CATEGORIES = [
  "Error Handling",
  "Test Coverage",
  "Naming Conventions",
  "Type Safety",
  "API Design",
  "Performance",
];
