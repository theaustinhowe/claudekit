"use client";

import { X } from "lucide-react";
import { cn } from "../utils";
import { Button } from "./button";
import { DatePicker } from "./date-picker";
import { Input } from "./input";

export function TimestampPicker({
  value,
  onChange,
  disabled = false,
  placeholder,
  showLabels = true,
  className,
}: {
  value?: string;
  onChange: (value: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
  showLabels?: boolean;
  className?: string;
}) {
  const raw = value ?? "";
  const parts = raw.includes("T") ? raw.split("T") : raw.split(" ");
  const datePart = parts[0] ?? "";
  const timePart = (parts[1] ?? "00:00:00").replace(/[+-]\d{2}:?\d{2}$/, "").slice(0, 8);

  const todayStr = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const combine = (d: string, t: string) => {
    if (d && t) onChange(`${d}T${t}`);
    else if (d) onChange(d);
    else if (t) onChange(`${todayStr()}T${t}`);
    else onChange(null);
  };

  const handleNow = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    const h = String(now.getHours()).padStart(2, "0");
    const min = String(now.getMinutes()).padStart(2, "0");
    const s = String(now.getSeconds()).padStart(2, "0");
    onChange(`${y}-${m}-${d}T${h}:${min}:${s}`);
  };

  const hasValue = !!raw;

  return (
    <div className={cn("flex items-end gap-1.5", className)}>
      <div className="flex-1">
        {showLabels && <span className="text-xs text-muted-foreground mb-1 block">Date</span>}
        <DatePicker
          value={datePart || undefined}
          onChange={(d) => combine(d ?? "", timePart)}
          placeholder={placeholder ?? "Date"}
          disabled={disabled}
        />
      </div>
      <div>
        {showLabels && <span className="text-xs text-muted-foreground mb-1 block">Time</span>}
        <Input
          type="time"
          step="1"
          value={timePart}
          onChange={(e) => combine(datePart, e.target.value)}
          className="font-mono text-sm w-36"
          disabled={disabled}
        />
      </div>
      <div className="flex gap-1">
        <Button variant="outline" size="sm" className="h-9 shrink-0" onClick={handleNow} disabled={disabled}>
          Now
        </Button>
        {hasValue && !disabled && (
          <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={() => onChange(null)}>
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
