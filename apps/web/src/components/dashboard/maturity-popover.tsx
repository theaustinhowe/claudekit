"use client";

import { cn } from "@claudekit/ui";
import { Popover, PopoverContent, PopoverTrigger } from "@claudekit/ui/components/popover";
import { Slider } from "@claudekit/ui/components/slider";
import { useRef, useState } from "react";

const DOT_COLORS: Record<string, string> = {
  green: "bg-green-500",
  yellow: "bg-yellow-500",
  red: "bg-red-500",
};

function deriveMaturity(percentage: number) {
  if (percentage >= 80) return { label: "Stable", percentage, color: "green" as const };
  if (percentage >= 40) return { label: "Beta", percentage, color: "yellow" as const };
  return { label: "Alpha", percentage, color: "red" as const };
}

interface MaturityPopoverProps {
  percentage: number;
  color: "green" | "yellow" | "red";
  label: string;
  onCommit: (percentage: number) => void;
}

export function MaturityPopover({ percentage, color, label, onCommit }: MaturityPopoverProps) {
  const [localValue, setLocalValue] = useState(percentage);
  const openValueRef = useRef(percentage);

  const preview = deriveMaturity(localValue);

  return (
    <Popover
      onOpenChange={(open) => {
        if (open) {
          setLocalValue(percentage);
          openValueRef.current = percentage;
        } else {
          if (localValue !== openValueRef.current) {
            onCommit(localValue);
          }
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors rounded px-1 -mx-1"
          onClick={(e) => e.stopPropagation()}
        >
          <span className={cn("h-2 w-2 rounded-full", DOT_COLORS[color])} />
          <span>{label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56" align="start" onClick={(e) => e.stopPropagation()}>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Maturity</span>
            <span className={cn("inline-flex items-center gap-1.5 text-xs")}>
              <span className={cn("h-2 w-2 rounded-full", DOT_COLORS[preview.color])} />
              {preview.label} {preview.percentage}%
            </span>
          </div>
          <Slider value={[localValue]} onValueChange={([v]) => setLocalValue(v)} min={0} max={100} step={5} />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>Alpha</span>
            <span>Beta</span>
            <span>Stable</span>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
