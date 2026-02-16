"use client";

import { useMemo, useState } from "react";
import { cn } from "../utils";
import { Button } from "./button";

interface DiffLine {
  type: "header" | "hunk" | "add" | "delete" | "context";
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

function parseDiff(diff: string): DiffLine[] {
  const lines = diff.split("\n");
  const result: DiffLine[] = [];

  let oldLine = 0;
  let newLine = 0;

  for (const line of lines) {
    if (line.startsWith("diff --git") || line.startsWith("index ")) {
      result.push({ type: "header", content: line });
    } else if (
      line.startsWith("---") ||
      line.startsWith("+++") ||
      line.startsWith("new file") ||
      line.startsWith("deleted file")
    ) {
      result.push({ type: "header", content: line });
    } else if (line.startsWith("@@")) {
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        oldLine = Number.parseInt(match[1], 10);
        newLine = Number.parseInt(match[2], 10);
      }
      result.push({ type: "hunk", content: line });
    } else if (line.startsWith("+")) {
      result.push({
        type: "add",
        content: line.slice(1),
        newLineNumber: newLine++,
      });
    } else if (line.startsWith("-")) {
      result.push({
        type: "delete",
        content: line.slice(1),
        oldLineNumber: oldLine++,
      });
    } else if (line.startsWith(" ") || line === "") {
      result.push({
        type: "context",
        content: line.slice(1) || "",
        oldLineNumber: oldLine++,
        newLineNumber: newLine++,
      });
    }
  }

  return result;
}

interface DiffViewerProps {
  patch: string;
  maxLines?: number;
  className?: string;
}

export function DiffViewer({ patch, maxLines, className }: DiffViewerProps) {
  const [showAll, setShowAll] = useState(false);
  const allLines = useMemo(() => parseDiff(patch), [patch]);
  const truncated = maxLines != null && !showAll && allLines.length > maxLines;
  const lines = truncated ? allLines.slice(0, maxLines) : allLines;

  if (!patch.trim()) {
    return (
      <div className={cn("flex items-center justify-center p-8 text-muted-foreground", className)}>
        No changes in this file
      </div>
    );
  }

  return (
    <div className={cn("overflow-auto", className)}>
      <div className="min-w-max font-mono text-xs">
        {lines.map((line, index) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: diff lines have no unique ID
            key={index}
            className={cn(
              "flex",
              line.type === "add" && "bg-green-100 dark:bg-green-950/50",
              line.type === "delete" && "bg-red-100 dark:bg-red-950/50",
              line.type === "hunk" && "bg-blue-100 dark:bg-blue-950/30",
              line.type === "header" && "bg-muted text-muted-foreground",
            )}
          >
            {/* Line numbers */}
            {line.type !== "header" && line.type !== "hunk" && (
              <>
                <span
                  className="w-12 shrink-0 select-none border-r border-border px-2 text-right text-muted-foreground"
                  aria-hidden="true"
                >
                  {line.oldLineNumber ?? ""}
                </span>
                <span
                  className="w-12 shrink-0 select-none border-r border-border px-2 text-right text-muted-foreground"
                  aria-hidden="true"
                >
                  {line.newLineNumber ?? ""}
                </span>
              </>
            )}

            {/* Content */}
            <span
              className={cn(
                "flex-1 whitespace-pre px-2 py-0.5",
                line.type === "header" && "pl-4",
                line.type === "hunk" && "pl-4 text-blue-600 dark:text-blue-400",
              )}
            >
              {line.type === "add" && (
                <span className="mr-1 text-green-600 dark:text-green-400" aria-hidden="true">
                  +
                </span>
              )}
              {line.type === "delete" && (
                <span className="mr-1 text-red-600 dark:text-red-400" aria-hidden="true">
                  -
                </span>
              )}
              {line.content}
            </span>
          </div>
        ))}
      </div>
      {truncated && (
        <div className="text-center py-2 border-t">
          <Button variant="ghost" size="sm" className="text-xs h-6" onClick={() => setShowAll(true)}>
            Show all {allLines.length} lines
          </Button>
        </div>
      )}
    </div>
  );
}
