"use client";

import { useState } from "react";
import { Button } from "@devkit/ui/components/button";

interface DiffViewerProps {
  patch: string;
  maxLines?: number;
}

export function DiffViewer({ patch, maxLines = 100 }: DiffViewerProps) {
  const [showAll, setShowAll] = useState(false);
  const lines = patch.split("\n");
  const truncated = !showAll && lines.length > maxLines;
  const visibleLines = truncated ? lines.slice(0, maxLines) : lines;

  return (
    <div className="bg-muted/20 border-t overflow-x-auto">
      <pre className="text-xs font-mono leading-relaxed">
        {visibleLines.map((line, idx) => {
          let lineClass = "px-3 py-0 whitespace-pre";
          if (line.startsWith("+") && !line.startsWith("+++")) {
            lineClass += " bg-green-50 text-green-800 dark:bg-green-950/30 dark:text-green-300";
          } else if (line.startsWith("-") && !line.startsWith("---")) {
            lineClass += " bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-300";
          } else if (line.startsWith("@@")) {
            lineClass += " bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300";
          } else {
            lineClass += " text-muted-foreground";
          }

          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: diff lines use position as key
            <div key={idx} className={lineClass}>
              {line}
            </div>
          );
        })}
      </pre>
      {truncated && (
        <div className="text-center py-2 border-t">
          <Button variant="ghost" size="sm" className="text-xs h-6" onClick={() => setShowAll(true)}>
            Show all {lines.length} lines
          </Button>
        </div>
      )}
    </div>
  );
}
