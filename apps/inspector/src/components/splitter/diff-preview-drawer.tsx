"use client";

import { cn } from "@claudekit/ui";
import { Badge } from "@claudekit/ui/components/badge";

interface DiffData {
  filePath: string;
  subPRTitle: string;
  diffContent?: string;
}

export function DiffPreviewDrawer({ data }: { data: DiffData }) {
  const content = data.diffContent || "No diff content available. Select a file to view its changes.";
  const lines = content.split("\n");

  return (
    <div className="space-y-4">
      <div>
        <Badge variant="secondary" className="text-[10px] mb-2">
          {data.subPRTitle}
        </Badge>
        <code className="block text-sm font-mono text-foreground">{data.filePath}</code>
      </div>

      <div className="rounded-lg border overflow-hidden">
        <div className="bg-muted px-3 py-1.5 border-b">
          <span className="text-xs font-mono text-muted-foreground">{data.filePath}</span>
        </div>
        <div className="text-xs font-mono leading-5 overflow-x-auto">
          {lines.map((line, lineNumber) => {
            const isAdd = line.startsWith("+") && !line.startsWith("+++");
            const isDel = line.startsWith("-") && !line.startsWith("---");
            const isHunk = line.startsWith("@@");
            return (
              <div
                key={`${lineNumber}:${line}`}
                className={cn(
                  "px-3 py-0",
                  isAdd && "bg-status-success/10 text-foreground",
                  isDel && "bg-status-error/10 text-foreground",
                  isHunk && "bg-muted text-muted-foreground",
                )}
              >
                <span className="inline-block w-5 text-right mr-3 text-muted-foreground select-none">
                  {lineNumber + 1}
                </span>
                {line}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
