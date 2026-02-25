"use client";

import { CalendarIcon, X } from "lucide-react";
import { useState } from "react";
import { cn } from "../utils";
import { Button, buttonVariants } from "./button";
import { Calendar } from "./calendar";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { Separator } from "./separator";
import { TimePicker } from "./time-picker";

function formatDate(day: Date): string {
  const y = day.getFullYear();
  const m = String(day.getMonth() + 1).padStart(2, "0");
  const d = String(day.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDisplay(datePart: string, timePart: string): string {
  if (!datePart) return "";
  const [y, m, d] = datePart.split("-");
  const dateStr = `${y}-${m}-${d}`;
  return timePart ? `${dateStr} ${timePart}` : dateStr;
}

export function TimestampPicker({
  value,
  onChange,
  disabled = false,
  placeholder,
  showLabels: _showLabels,
  className,
}: {
  value?: string;
  onChange: (value: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
  showLabels?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  const raw = value ?? "";
  const parts = raw.includes("T") ? raw.split("T") : raw.split(" ");
  const datePart = parts[0] ?? "";
  const timePart = (parts[1] ?? "00:00:00").replace(/[+-]\d{2}:?\d{2}$/, "").slice(0, 8);

  const parsed = datePart ? new Date(`${datePart}T00:00:00`) : undefined;
  const isValid = parsed && !Number.isNaN(parsed.getTime());
  const hasValue = !!raw;

  const displayText = hasValue ? formatDisplay(datePart, timePart) : "";

  const todayStr = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const combine = (d: string, t: string) => {
    if (d && t) onChange(`${d}T${t}`);
    else if (d) onChange(`${d}T00:00:00`);
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
    setOpen(false);
  };

  return (
    <div className={cn("relative", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn("w-full justify-start text-left font-mono text-sm h-9", hasValue && "pr-8")}
            disabled={disabled}
          >
            <CalendarIcon className="mr-2 h-3.5 w-3.5 shrink-0" />
            {displayText ? (
              displayText
            ) : (
              <span className="text-muted-foreground">{placeholder ?? "Pick date & time"}</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            captionLayout="dropdown"
            navLayout="around"
            startMonth={new Date(new Date().getFullYear() - 10, 0)}
            endMonth={new Date(new Date().getFullYear() + 10, 11)}
            classNames={{
              month: "relative",
              month_caption: "flex justify-center items-center mx-8",
              caption_label: "text-sm font-medium cursor-pointer inline-flex items-center gap-0.5",
              dropdowns: "flex gap-2 items-center justify-center",
              dropdown_root: "relative inline-flex items-center",
              dropdown: "absolute inset-0 z-10 w-full opacity-0 cursor-pointer",
              chevron: "h-3.5 w-3.5 opacity-50",
              button_previous: cn(
                buttonVariants({ variant: "outline" }),
                "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 absolute left-1 top-0",
              ),
              button_next: cn(
                buttonVariants({ variant: "outline" }),
                "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 absolute right-1 top-0",
              ),
            }}
            selected={isValid ? parsed : undefined}
            onSelect={(day) => {
              if (day) {
                combine(formatDate(day), timePart);
              } else {
                onChange(null);
              }
            }}
          />
          <Separator />
          <div className="flex justify-center p-2">
            <TimePicker value={timePart} onChange={(t) => combine(datePart || todayStr(), t ?? "00:00:00")} />
          </div>
          <Separator />
          <div className="flex items-center justify-between px-3 py-2">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleNow}>
              Now
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
            >
              Clear
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      {hasValue && !disabled && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
