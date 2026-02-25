"use client";

import { Input } from "@claudekit/ui/components/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@claudekit/ui/components/select";
import { TableCell, TableRow } from "@claudekit/ui/components/table";
import { X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ColumnFilter, ColumnInfo, FilterOperator } from "@/lib/types";

const NUMERIC_TYPES = new Set(["INTEGER", "BIGINT", "SMALLINT", "TINYINT", "FLOAT", "DOUBLE", "DECIMAL", "HUGEINT"]);
const BOOLEAN_TYPES = new Set(["BOOLEAN"]);

function isNumericType(dataType: string) {
  return NUMERIC_TYPES.has(dataType.toUpperCase());
}

function isBooleanType(dataType: string) {
  return BOOLEAN_TYPES.has(dataType.toUpperCase());
}

function getFilterForColumn(column: string, filters: ColumnFilter[]): ColumnFilter | undefined {
  return filters.find((f) => f.column === column);
}

function FilterInput({
  column,
  filter,
  onChange,
}: {
  column: ColumnInfo;
  filter: ColumnFilter | undefined;
  onChange: (column: string, operator: FilterOperator, value?: string) => void;
}) {
  const isBool = isBooleanType(column.data_type);
  const isNum = isNumericType(column.data_type);

  if (isBool) {
    const current = filter ? filter.operator : "all";
    return (
      <Select
        value={current === "is_true" ? "true" : current === "is_false" ? "false" : "all"}
        onValueChange={(v) => {
          if (v === "true") onChange(column.column_name, "is_true");
          else if (v === "false") onChange(column.column_name, "is_false");
          else onChange(column.column_name, "eq", ""); // signals clear
        }}
      >
        <SelectTrigger className="h-6 text-xs border-dashed w-full min-w-[70px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          <SelectItem value="true">True</SelectItem>
          <SelectItem value="false">False</SelectItem>
        </SelectContent>
      </Select>
    );
  }

  if (isNum) {
    return <NumericFilterInput column={column.column_name} filter={filter} onChange={onChange} />;
  }

  return <TextFilterInput column={column.column_name} filter={filter} onChange={onChange} />;
}

function TextFilterInput({
  column,
  filter,
  onChange,
}: {
  column: string;
  filter: ColumnFilter | undefined;
  onChange: (column: string, operator: FilterOperator, value?: string) => void;
}) {
  const [local, setLocal] = useState(filter?.value ?? "");
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Sync from parent when filter prop changes (e.g. URL navigation)
  useEffect(() => {
    setLocal(filter?.value ?? "");
  }, [filter?.value]);

  const commit = useCallback(
    (val: string) => {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        onChange(column, "contains", val);
      }, 300);
    },
    [column, onChange],
  );

  useEffect(() => () => clearTimeout(timerRef.current), []);

  return (
    <div className="relative">
      <Input
        value={local}
        onChange={(e) => {
          setLocal(e.target.value);
          commit(e.target.value);
        }}
        placeholder="Filter..."
        className="h-6 text-xs border-dashed pr-6"
      />
      {local && (
        <button
          type="button"
          className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          onClick={() => {
            setLocal("");
            clearTimeout(timerRef.current);
            onChange(column, "contains", "");
          }}
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

function NumericFilterInput({
  column,
  filter,
  onChange,
}: {
  column: string;
  filter: ColumnFilter | undefined;
  onChange: (column: string, operator: FilterOperator, value?: string) => void;
}) {
  const [local, setLocal] = useState(filter?.value ?? "");
  const [op, setOp] = useState<FilterOperator>(filter?.operator ?? "eq");
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    setLocal(filter?.value ?? "");
    if (filter?.operator) setOp(filter.operator);
  }, [filter?.value, filter?.operator]);

  const commit = useCallback(
    (val: string, operator: FilterOperator) => {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        onChange(column, operator, val);
      }, 300);
    },
    [column, onChange],
  );

  useEffect(() => () => clearTimeout(timerRef.current), []);

  return (
    <div className="flex gap-0.5">
      <Select
        value={op}
        onValueChange={(v) => {
          const newOp = v as FilterOperator;
          setOp(newOp);
          if (local) commit(local, newOp);
        }}
      >
        <SelectTrigger className="h-6 text-xs border-dashed w-14 px-1 shrink-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="eq">=</SelectItem>
          <SelectItem value="neq">!=</SelectItem>
          <SelectItem value="gt">&gt;</SelectItem>
          <SelectItem value="gte">&gt;=</SelectItem>
          <SelectItem value="lt">&lt;</SelectItem>
          <SelectItem value="lte">&lt;=</SelectItem>
        </SelectContent>
      </Select>
      <div className="relative flex-1">
        <Input
          type="number"
          value={local}
          onChange={(e) => {
            setLocal(e.target.value);
            commit(e.target.value, op);
          }}
          placeholder="#"
          className="h-6 text-xs border-dashed pr-6"
        />
        {local && (
          <button
            type="button"
            className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            onClick={() => {
              setLocal("");
              clearTimeout(timerRef.current);
              onChange(column, op, "");
            }}
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}

export function ColumnFilterRow({
  columns,
  filters,
  onFilterChange,
  hasActions,
}: {
  columns: ColumnInfo[];
  filters: ColumnFilter[];
  onFilterChange: (column: string, operator: FilterOperator, value?: string) => void;
  hasActions: boolean;
}) {
  return (
    <TableRow className="hover:bg-transparent bg-muted/30">
      {columns.map((col) => (
        <TableCell key={col.column_name} className="py-1 px-2">
          <FilterInput column={col} filter={getFilterForColumn(col.column_name, filters)} onChange={onFilterChange} />
        </TableCell>
      ))}
      {hasActions && <TableCell className="py-1" />}
    </TableRow>
  );
}
