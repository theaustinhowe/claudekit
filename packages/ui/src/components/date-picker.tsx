"use client";

import { CalendarIcon, X } from "lucide-react";
import { useState } from "react";
import { cn } from "../utils";
import { Button, buttonVariants } from "./button";
import { Calendar } from "./calendar";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

function formatDate(day: Date): string {
  const y = day.getFullYear();
  const m = String(day.getMonth() + 1).padStart(2, "0");
  const d = String(day.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function DatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
  disabled = false,
  className,
}: {
  value?: string;
  onChange: (value: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  const parsed = value ? new Date(`${value}T00:00:00`) : undefined;
  const isValid = parsed && !Number.isNaN(parsed.getTime());

  return (
    <div className={cn("relative", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn("w-full justify-start text-left font-mono text-sm h-9", isValid && "pr-8")}
            disabled={disabled}
          >
            <CalendarIcon className="mr-2 h-3.5 w-3.5 shrink-0" />
            {isValid ? value : <span className="text-muted-foreground">{placeholder}</span>}
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
                onChange(formatDate(day));
              } else {
                onChange(null);
              }
              setOpen(false);
            }}
          />
          <div className="border-t px-3 py-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full h-7 text-xs"
              onClick={() => {
                onChange(formatDate(new Date()));
                setOpen(false);
              }}
            >
              Today
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      {isValid && !disabled && (
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
