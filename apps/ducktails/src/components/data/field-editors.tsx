"use client";

import { DatePicker } from "@claudekit/ui/components/date-picker";
import { Input } from "@claudekit/ui/components/input";
import { JsonEditor } from "@claudekit/ui/components/json-editor";
import { Switch } from "@claudekit/ui/components/switch";
import { Textarea } from "@claudekit/ui/components/textarea";
import { TimestampPicker } from "@claudekit/ui/components/timestamp-picker";
import type { ColumnInfo } from "@/lib/types";

// ── Type classifiers ──────────────────────────────────────────────

export function isBooleanType(dataType: string): boolean {
  return dataType.toUpperCase() === "BOOLEAN";
}

export function isNumericType(dataType: string): boolean {
  const upper = dataType.toUpperCase();
  return [
    "INTEGER",
    "BIGINT",
    "SMALLINT",
    "TINYINT",
    "FLOAT",
    "DOUBLE",
    "DECIMAL",
    "HUGEINT",
    "UBIGINT",
    "UINTEGER",
    "USMALLINT",
    "UTINYINT",
  ].some((t) => upper.includes(t));
}

export function isDateType(dataType: string): boolean {
  return dataType.toUpperCase() === "DATE";
}

export function isTimestampType(dataType: string): boolean {
  const upper = dataType.toUpperCase();
  return upper.startsWith("TIMESTAMP");
}

export function isTimeType(dataType: string): boolean {
  const upper = dataType.toUpperCase();
  return upper === "TIME" || upper === "TIME WITH TIME ZONE";
}

export function isComplexType(dataType: string): boolean {
  const upper = dataType.toUpperCase();
  return upper.startsWith("LIST") || upper.startsWith("MAP") || upper.startsWith("STRUCT") || upper === "JSON";
}

export function isBlobType(dataType: string): boolean {
  return dataType.toUpperCase() === "BLOB";
}

// ── Main dispatcher ───────────────────────────────────────────────

export function FieldEditor({
  column,
  value,
  onChange,
}: {
  column: ColumnInfo;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const { data_type } = column;

  if (isBlobType(data_type)) {
    const size = value instanceof ArrayBuffer ? value.byteLength : typeof value === "string" ? value.length : 0;
    return <span className="text-xs text-muted-foreground italic">[BLOB: {size} bytes]</span>;
  }

  if (isBooleanType(data_type)) {
    return <Switch checked={!!value} onCheckedChange={(checked) => onChange(checked)} />;
  }

  if (isDateType(data_type)) {
    const dateStr = value != null ? String(value) : undefined;
    return <DatePicker value={dateStr} onChange={(v) => onChange(v)} />;
  }

  if (isTimestampType(data_type)) {
    const tsStr = value != null ? String(value) : undefined;
    return <TimestampPicker value={tsStr} onChange={(v) => onChange(v)} />;
  }

  if (isTimeType(data_type)) {
    return (
      <Input
        type="time"
        step="1"
        value={value != null ? String(value) : ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="font-mono text-sm"
      />
    );
  }

  if (isComplexType(data_type)) {
    const jsonStr = value == null ? "" : typeof value === "string" ? value : JSON.stringify(value);
    return (
      <JsonEditor
        value={jsonStr}
        onChange={(text) => {
          if (text === "") {
            onChange(null);
          } else {
            try {
              onChange(JSON.parse(text));
            } catch {
              onChange(text);
            }
          }
        }}
        className="space-y-1"
      />
    );
  }

  if (isNumericType(data_type)) {
    return (
      <Input
        type="number"
        value={value != null ? String(value) : ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        placeholder={column.is_nullable === "YES" ? "NULL" : ""}
        className="font-mono text-sm"
      />
    );
  }

  // VARCHAR / TEXT — use textarea for long values
  const strVal = value != null ? String(value) : "";
  const isLong = strVal.length > 100 || strVal.includes("\n");

  if (isLong) {
    return (
      <Textarea
        value={strVal}
        onChange={(e) => onChange(e.target.value || null)}
        placeholder={column.is_nullable === "YES" ? "NULL" : ""}
        className="font-mono text-sm min-h-[80px]"
      />
    );
  }

  return (
    <Input
      type="text"
      value={strVal}
      onChange={(e) => onChange(e.target.value || null)}
      placeholder={column.is_nullable === "YES" ? "NULL" : ""}
      className="font-mono text-sm"
    />
  );
}
