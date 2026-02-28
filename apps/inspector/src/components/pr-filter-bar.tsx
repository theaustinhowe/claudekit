"use client";

import { cn } from "@claudekit/ui";
import { Button } from "@claudekit/ui/components/button";
import { Input } from "@claudekit/ui/components/input";
import { ArrowDownAZ, ArrowUpAZ, Search } from "lucide-react";
import type { PRFilters, PRSortField } from "@/lib/types";

interface PRFilterBarProps {
  filters: PRFilters;
  resultCount: number;
  totalCount: number;
  onSearchChange: (search: string) => void;
  onStateChange: (state: PRFilters["state"]) => void;
  onSizeChange: (size: PRFilters["size"]) => void;
  onSortFieldChange: (field: PRSortField) => void;
  onToggleDirection: () => void;
}

const stateOptions: { value: PRFilters["state"]; label: string }[] = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
];

const sizeOptions: { value: PRFilters["size"]; label: string }[] = [
  { value: "all", label: "Any size" },
  { value: "S", label: "S" },
  { value: "M", label: "M" },
  { value: "L", label: "L" },
  { value: "XL", label: "XL" },
];

const sortOptions: { value: PRSortField; label: string }[] = [
  { value: "created", label: "Created" },
  { value: "updated", label: "Updated" },
  { value: "size", label: "Size" },
  { value: "comments", label: "Comments" },
  { value: "title", label: "Title" },
];

export function PRFilterBar({
  filters,
  resultCount,
  totalCount,
  onSearchChange,
  onStateChange,
  onSizeChange,
  onSortFieldChange,
  onToggleDirection,
}: PRFilterBarProps) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-wrap">
      <div className="relative flex-1 min-w-[180px] max-w-xs">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Search PRs..."
          value={filters.search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-8 h-8 text-sm"
        />
      </div>

      <div className="flex items-center gap-1">
        {stateOptions.map((opt) => (
          <Button
            key={opt.value}
            variant={filters.state === opt.value ? "default" : "ghost"}
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => onStateChange(opt.value)}
          >
            {opt.label}
          </Button>
        ))}
      </div>

      <div className="flex items-center gap-1">
        {sizeOptions.map((opt) => (
          <Button
            key={opt.value}
            variant={filters.size === opt.value ? "default" : "ghost"}
            size="sm"
            className={cn("h-7 px-2 text-xs", opt.value === "all" && "min-w-[60px]")}
            onClick={() => onSizeChange(opt.value)}
          >
            {opt.label}
          </Button>
        ))}
      </div>

      <div className="flex items-center gap-1 ml-auto">
        <select
          value={filters.sortField}
          onChange={(e) => onSortFieldChange(e.target.value as PRSortField)}
          className="h-7 rounded-md border border-input bg-background px-2 text-xs outline-none"
        >
          {sortOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onToggleDirection}>
          {filters.sortDirection === "desc" ? (
            <ArrowDownAZ className="h-3.5 w-3.5" />
          ) : (
            <ArrowUpAZ className="h-3.5 w-3.5" />
          )}
        </Button>
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {resultCount === totalCount
            ? `${resultCount.toLocaleString()} PRs`
            : `${resultCount.toLocaleString()} / ${totalCount.toLocaleString()}`}
        </span>
      </div>
    </div>
  );
}
