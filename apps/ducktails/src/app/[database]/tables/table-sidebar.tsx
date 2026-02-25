"use client";

import { cn } from "@claudekit/ui";
import { Input } from "@claudekit/ui/components/input";
import { Search, Table2, Terminal } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import type { TableSummary } from "@/lib/types";

export function TableSidebar({
  databaseId,
  databaseName,
  tables,
}: {
  databaseId: string;
  databaseName: string;
  tables: TableSummary[];
}) {
  const params = useParams();
  const activeTable = params.table as string | undefined;
  const [search, setSearch] = useState("");
  const filtered = tables.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="w-56 shrink-0 border-r flex flex-col bg-muted/30">
      <div className="p-3 border-b space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm truncate">{databaseName}</h2>
          <Link
            href={`/${databaseId}/query`}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="SQL Editor"
          >
            <Terminal className="h-4 w-4" />
          </Link>
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Filter tables..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-7 text-xs pl-7"
          />
        </div>
      </div>
      <nav className="flex-1 overflow-auto py-1">
        {filtered.map((table) => (
          <Link
            key={table.name}
            href={`/${databaseId}/tables/${table.name}`}
            className={cn(
              "flex items-center justify-between px-3 py-1.5 text-xs hover:bg-muted/80 transition-colors",
              activeTable === table.name && "bg-muted font-medium text-foreground",
              activeTable !== table.name && "text-muted-foreground",
            )}
          >
            <span className="flex items-center gap-1.5 truncate">
              <Table2 className="h-3 w-3 shrink-0" />
              <span className="truncate">{table.name}</span>
            </span>
            <span className="text-[10px] tabular-nums shrink-0 ml-2 opacity-60">{table.rowCount.toLocaleString()}</span>
          </Link>
        ))}
        {filtered.length === 0 && tables.length > 0 && (
          <p className="text-muted-foreground text-xs text-center py-4 px-3">No match</p>
        )}
        {tables.length === 0 && <p className="text-muted-foreground text-xs text-center py-4 px-3">No tables</p>}
      </nav>
      <div className="border-t px-3 py-2 text-[10px] text-muted-foreground">{tables.length} tables</div>
    </div>
  );
}
