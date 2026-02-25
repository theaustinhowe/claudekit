"use client";

import { Badge } from "@claudekit/ui/components/badge";

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  online: { label: "Online", variant: "default" },
  not_found: { label: "Not Found", variant: "secondary" },
  locked: { label: "Locked", variant: "outline" },
  error: { label: "Error", variant: "destructive" },
};

export function DatabaseStatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.error;
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
