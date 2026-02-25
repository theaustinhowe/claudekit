"use client";

import { Check } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { cn } from "../utils";
import { ScrollArea } from "./scroll-area";

interface TimePickerProps {
  value?: string;
  onChange: (value: string | null) => void;
  granularity?: "hour-minute" | "hour-minute-second";
  disabled?: boolean;
  className?: string;
}

function parseTime(value: string | undefined): { hour: number; minute: number; second: number } | null {
  if (!value) return null;
  const parts = value.split(":");
  if (parts.length < 2) return null;
  const hour = Number.parseInt(parts[0], 10);
  const minute = Number.parseInt(parts[1], 10);
  const second = parts.length >= 3 ? Number.parseInt(parts[2], 10) : 0;
  if (Number.isNaN(hour) || Number.isNaN(minute) || Number.isNaN(second)) return null;
  return { hour, minute, second };
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function TimeColumn({
  count,
  selected,
  onSelect,
  disabled,
  label,
}: {
  count: number;
  selected: number | null;
  onSelect: (value: number) => void;
  disabled?: boolean;
  label: string;
}) {
  const items = useMemo(() => Array.from({ length: count }, (_, i) => ({ value: i, label: pad2(i) })), [count]);
  const viewportRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (selectedRef.current) {
      selectedRef.current.scrollIntoView({ block: "center" });
    }
  }, []);

  return (
    <div className="flex flex-col">
      <div className="text-xs text-muted-foreground text-center py-1 font-medium">{label}</div>
      <ScrollArea className="h-[200px] w-16" viewportRef={viewportRef}>
        <div className="flex flex-col p-1">
          {items.map((item) => {
            const isSelected = selected === item.value;
            return (
              <button
                type="button"
                key={item.label}
                ref={isSelected ? selectedRef : undefined}
                disabled={disabled}
                onClick={() => onSelect(item.value)}
                className={cn(
                  "relative flex items-center justify-center rounded-md h-8 text-sm transition-colors",
                  "hover:bg-accent hover:text-accent-foreground",
                  "disabled:pointer-events-none disabled:opacity-50",
                  isSelected && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
                )}
              >
                {item.label}
                {isSelected && <Check className="absolute right-1 h-3 w-3" />}
              </button>
            );
          })}
          <div className="h-[168px]" />
        </div>
      </ScrollArea>
    </div>
  );
}

export function TimePicker({
  value,
  onChange,
  granularity = "hour-minute-second",
  disabled,
  className,
}: TimePickerProps) {
  const parsed = parseTime(value);

  const handleSelect = (field: "hour" | "minute" | "second", val: number) => {
    const current = parsed ?? { hour: 0, minute: 0, second: 0 };
    const next = { ...current, [field]: val };
    const timeStr =
      granularity === "hour-minute"
        ? `${pad2(next.hour)}:${pad2(next.minute)}`
        : `${pad2(next.hour)}:${pad2(next.minute)}:${pad2(next.second)}`;
    onChange(timeStr);
  };

  return (
    <div className={cn("flex gap-0", className)}>
      <TimeColumn
        count={24}
        selected={parsed?.hour ?? null}
        onSelect={(v) => handleSelect("hour", v)}
        disabled={disabled}
        label="HH"
      />
      <TimeColumn
        count={60}
        selected={parsed?.minute ?? null}
        onSelect={(v) => handleSelect("minute", v)}
        disabled={disabled}
        label="MM"
      />
      {granularity === "hour-minute-second" && (
        <TimeColumn
          count={60}
          selected={parsed?.second ?? null}
          onSelect={(v) => handleSelect("second", v)}
          disabled={disabled}
          label="SS"
        />
      )}
    </div>
  );
}
