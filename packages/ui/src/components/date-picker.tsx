"use client";

import { CalendarIcon } from "lucide-react";
import { Button } from "./button";
import { Calendar } from "./calendar";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

export function DatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
}: {
  value?: string;
  onChange: (value: string | null) => void;
  placeholder?: string;
}) {
  const parsed = value ? new Date(`${value}T00:00:00`) : undefined;
  const isValid = parsed && !Number.isNaN(parsed.getTime());

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-start text-left font-mono text-sm h-9">
          <CalendarIcon className="mr-2 h-3.5 w-3.5 shrink-0" />
          {isValid ? value : <span className="text-muted-foreground">{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={isValid ? parsed : undefined}
          onSelect={(day) => {
            if (day) {
              const y = day.getFullYear();
              const m = String(day.getMonth() + 1).padStart(2, "0");
              const d = String(day.getDate()).padStart(2, "0");
              onChange(`${y}-${m}-${d}`);
            } else {
              onChange(null);
            }
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
