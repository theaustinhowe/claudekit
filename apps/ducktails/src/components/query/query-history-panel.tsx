"use client";

import { cn } from "@claudekit/ui";
import { Button } from "@claudekit/ui/components/button";
import { Input } from "@claudekit/ui/components/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@claudekit/ui/components/tooltip";
import { Clock, Search, Trash2, X } from "lucide-react";
import { useState } from "react";
import type { QueryHistoryEntry } from "@/hooks/use-query-history";
import { formatRelativeTime } from "@/lib/format-relative-time";

interface QueryHistorySidebarProps {
  history: QueryHistoryEntry[];
  onSelect: (sql: string) => void;
  onRemove: (timestamp: number) => void;
  onClear: () => void;
}

export function QueryHistorySidebar({ history, onSelect, onRemove, onClear }: QueryHistorySidebarProps) {
  const [search, setSearch] = useState("");
  const filtered = history.filter((e) => e.sql.toLowerCase().includes(search.toLowerCase()));

  return (
    <TooltipProvider>
      <div className="w-56 shrink-0 border-r flex flex-col bg-muted/30">
        <div className="p-3 border-b space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm">History</h2>
            {history.length > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onClear}
                    className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Clear all</TooltipContent>
              </Tooltip>
            )}
          </div>
          {history.length > 3 && (
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Filter history..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-7 text-xs pl-7"
              />
            </div>
          )}
        </div>
        <nav className="flex-1 overflow-auto py-1">
          {filtered.map((entry) => (
            <div
              key={entry.timestamp}
              className={cn(
                "group flex items-start gap-1.5 px-3 py-1.5 text-xs hover:bg-muted/80 transition-colors cursor-pointer",
                "text-muted-foreground",
              )}
            >
              <button type="button" className="flex-1 text-left min-w-0" onClick={() => onSelect(entry.sql)}>
                <p className="font-mono truncate text-foreground/80">{entry.sql}</p>
                <span className="flex items-center gap-1 text-[10px] opacity-60 mt-0.5">
                  <Clock className="h-2.5 w-2.5" />
                  {formatRelativeTime(entry.timestamp)}
                </span>
              </button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 shrink-0 text-muted-foreground hover:text-destructive mt-0.5"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(entry.timestamp);
                    }}
                  >
                    <X className="h-2.5 w-2.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Remove</TooltipContent>
              </Tooltip>
            </div>
          ))}
          {filtered.length === 0 && history.length > 0 && (
            <p className="text-muted-foreground text-xs text-center py-4 px-3">No match</p>
          )}
          {history.length === 0 && (
            <p className="text-muted-foreground text-xs text-center py-4 px-3">No queries yet</p>
          )}
        </nav>
        <div className="border-t px-3 py-2 text-[10px] text-muted-foreground">{history.length} queries</div>
      </div>
    </TooltipProvider>
  );
}
