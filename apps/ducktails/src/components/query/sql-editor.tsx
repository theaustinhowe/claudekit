"use client";

import { Button } from "@claudekit/ui/components/button";
import { Textarea } from "@claudekit/ui/components/textarea";
import { Play } from "lucide-react";
import { useCallback } from "react";

export function SqlEditor({
  value,
  onChange,
  onRun,
  isRunning,
}: {
  value: string;
  onChange: (value: string) => void;
  onRun: () => void;
  isRunning: boolean;
}) {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        onRun();
      }
    },
    [onRun],
  );

  return (
    <div className="space-y-2">
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="SELECT * FROM ..."
        className="font-mono text-sm min-h-[120px] resize-y"
        rows={6}
      />
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {typeof navigator !== "undefined" && navigator.platform?.includes("Mac") ? "Cmd" : "Ctrl"}+Enter to run
        </p>
        <Button onClick={onRun} disabled={isRunning || !value.trim()} size="sm">
          <Play className="h-4 w-4 mr-1" />
          {isRunning ? "Running..." : "Run Query"}
        </Button>
      </div>
    </div>
  );
}
