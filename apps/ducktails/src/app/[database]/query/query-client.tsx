"use client";

import { useCallback, useState } from "react";
import { QueryHistorySidebar } from "@/components/query/query-history-panel";
import { QueryResults } from "@/components/query/query-results";
import { SqlEditor } from "@/components/query/sql-editor";
import { useQueryHistory } from "@/hooks/use-query-history";
import { executeQuery } from "@/lib/actions/query";
import { getSchemaForCompletion } from "@/lib/actions/tables";
import type { QueryResult } from "@/lib/types";

const DDL_PATTERN = /^\s*(CREATE|ALTER|DROP|RENAME)\b/i;

export function QueryClient({
  databaseId,
  databaseName,
  schema: initialSchema,
}: {
  databaseId: string;
  databaseName: string;
  schema: Record<string, string[]>;
}) {
  const [sql, setSql] = useState("");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [currentSchema, setCurrentSchema] = useState(initialSchema);
  const { history, addEntry, removeEntry, clearHistory } = useQueryHistory(databaseId);

  const refreshSchema = useCallback(async () => {
    try {
      const updated = await getSchemaForCompletion(databaseId);
      setCurrentSchema(updated);
    } catch {}
  }, [databaseId]);

  const handleRun = async () => {
    const trimmed = sql.trim();
    if (!trimmed) return;
    setIsRunning(true);
    try {
      const res = await executeQuery(databaseId, trimmed);
      setResult(res);
      addEntry(trimmed);
      if (DDL_PATTERN.test(trimmed)) {
        refreshSchema();
      }
    } catch (err) {
      setResult({
        columns: [],
        rows: [],
        rowCount: 0,
        executionTimeMs: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="flex flex-1 min-h-0 h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* History sidebar */}
      <QueryHistorySidebar history={history} onSelect={setSql} onRemove={removeEntry} onClear={clearHistory} />

      {/* Main editor + results area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Editor pane */}
        <div className="flex flex-col border-b" style={{ height: "45%", minHeight: 200 }}>
          <div className="flex items-center gap-2 px-3 py-1.5 border-b bg-muted/30 shrink-0">
            <span className="text-sm font-medium">{databaseName}</span>
            <span className="text-xs text-muted-foreground">SQL Editor</span>
          </div>
          <SqlEditor value={sql} onChange={setSql} onRun={handleRun} isRunning={isRunning} schema={currentSchema} />
        </div>

        {/* Results pane */}
        <div className="flex-1 min-h-0 overflow-auto p-4">{result && <QueryResults result={result} />}</div>
      </div>
    </div>
  );
}
