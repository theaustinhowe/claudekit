"use client";

import { Button } from "@claudekit/ui/components/button";
import { Play } from "lucide-react";
import { CodeMirrorEditor } from "./codemirror-editor";

export function SqlEditor({
  value,
  onChange,
  onRun,
  isRunning,
  schema,
}: {
  value: string;
  onChange: (value: string) => void;
  onRun: () => void;
  isRunning: boolean;
  schema?: Record<string, string[]>;
}) {
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center justify-between px-3 py-1.5 border-b bg-muted/30">
        <p className="text-xs text-muted-foreground">
          {typeof navigator !== "undefined" && navigator.platform?.includes("Mac") ? "Cmd" : "Ctrl"}+Enter to run
        </p>
        <Button onClick={onRun} disabled={isRunning || !value.trim()} size="sm" className="h-7 text-xs">
          <Play className="h-3 w-3 mr-1" />
          {isRunning ? "Running..." : "Run Query"}
        </Button>
      </div>
      <div className="flex-1 min-h-0">
        <CodeMirrorEditor value={value} onChange={onChange} onRun={onRun} schema={schema} />
      </div>
    </div>
  );
}
