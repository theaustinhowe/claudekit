"use client";

import { DatePicker } from "./date-picker";
import { Input } from "./input";

export function TimestampPicker({ value, onChange }: { value?: string; onChange: (value: string | null) => void }) {
  const raw = value ?? "";
  const parts = raw.includes("T") ? raw.split("T") : raw.split(" ");
  const datePart = parts[0] ?? "";
  const timePart = (parts[1] ?? "00:00:00").replace(/[+-]\d{2}:?\d{2}$/, "").slice(0, 8);

  const combine = (d: string, t: string) => {
    onChange(d && t ? `${d}T${t}` : d || null);
  };

  return (
    <div className="flex gap-2">
      <div className="flex-1">
        <DatePicker value={datePart || undefined} onChange={(d) => combine(d ?? "", timePart)} placeholder="Date" />
      </div>
      <Input
        type="time"
        step="1"
        value={timePart}
        onChange={(e) => combine(datePart, e.target.value)}
        className="font-mono text-sm w-36"
      />
    </div>
  );
}
