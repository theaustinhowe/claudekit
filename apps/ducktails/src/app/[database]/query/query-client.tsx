"use client";

import { Button } from "@claudekit/ui/components/button";
import { Clock, Trash2 } from "lucide-react";
import { useState } from "react";
import { QueryResults } from "@/components/query/query-results";
import { SqlEditor } from "@/components/query/sql-editor";
import { useQueryHistory } from "@/hooks/use-query-history";
import { executeQuery } from "@/lib/actions/query";
import type { QueryResult } from "@/lib/types";

export function QueryClient({ databaseId, databaseName }: { databaseId: string; databaseName: string }) {
  const [sql, setSql] = useState("");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const { history, addEntry, clearHistory } = useQueryHistory(databaseId);

  const handleRun = async () => {
    const trimmed = sql.trim();
    if (!trimmed) return;
    setIsRunning(true);
    try {
      const res = await executeQuery(databaseId, trimmed);
      setResult(res);
      addEntry(trimmed);
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
    <div className="p-6 max-w-full mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold">SQL Editor</h1>
        <p className="text-muted-foreground text-sm">{databaseName}</p>
      </div>

      <SqlEditor value={sql} onChange={setSql} onRun={handleRun} isRunning={isRunning} />

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowHistory(!showHistory)}
          className="text-muted-foreground"
        >
          <Clock className="h-4 w-4 mr-1" />
          History ({history.length})
        </Button>
        {showHistory && history.length > 0 && (
          <Button variant="ghost" size="sm" onClick={clearHistory} className="text-muted-foreground">
            <Trash2 className="h-4 w-4 mr-1" />
            Clear
          </Button>
        )}
      </div>

      {showHistory && history.length > 0 && (
        <div className="border rounded-lg divide-y max-h-48 overflow-auto">
          {history.map((entry) => (
            <button
              key={entry.timestamp}
              type="button"
              className="w-full text-left px-3 py-2 hover:bg-muted/50 text-sm font-mono truncate"
              onClick={() => {
                setSql(entry.sql);
                setShowHistory(false);
              }}
            >
              {entry.sql}
            </button>
          ))}
        </div>
      )}

      {result && <QueryResults result={result} />}
    </div>
  );
}
