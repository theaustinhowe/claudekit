"use client";

import { Button } from "@claudekit/ui/components/button";
import { Checkbox } from "@claudekit/ui/components/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@claudekit/ui/components/popover";
import { Columns3 } from "lucide-react";

export function ColumnPicker({
  allColumns,
  hiddenColumns,
  onToggle,
  onShowAll,
}: {
  allColumns: string[];
  hiddenColumns: Set<string>;
  onToggle: (column: string) => void;
  onShowAll: () => void;
}) {
  const visibleCount = allColumns.length - hiddenColumns.size;
  const hasHidden = hiddenColumns.size > 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5">
          <Columns3 className="h-3.5 w-3.5" />
          {hasHidden ? `${visibleCount}/${allColumns.length}` : "Columns"}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <span className="text-xs font-medium">Columns</span>
          {hasHidden && (
            <button type="button" onClick={onShowAll} className="text-xs text-primary hover:underline">
              Show all
            </button>
          )}
        </div>
        <div className="max-h-64 overflow-y-auto p-1">
          {allColumns.map((col) => (
            <button
              key={col}
              type="button"
              className="flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-accent cursor-pointer text-xs w-full text-left"
              onClick={() => onToggle(col)}
            >
              <Checkbox checked={!hiddenColumns.has(col)} tabIndex={-1} />
              <span className="font-mono truncate">{col}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
