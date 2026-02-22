"use client";

import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from "@devkit/ui/components/dialog";
import { parseStreamLog, type StreamEntry, StreamingDisplay } from "@devkit/ui/components/streaming-display";
import { useMemo } from "react";

interface ScaffoldLogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  logs: { log: string; logType: string }[];
}

export function ScaffoldLogDialog({ open, onOpenChange, logs }: ScaffoldLogDialogProps) {
  const entries = useMemo(() => {
    const result: StreamEntry[] = [];
    for (const l of logs) {
      result.push(...parseStreamLog(l.log, l.logType));
    }
    return result;
  }, [logs]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl h-[70vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-3 shrink-0">
          <DialogTitle>Scaffold Log</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="flex-1 overflow-y-auto px-6 pb-6">
            <div className="bg-zinc-950 rounded-lg border border-zinc-800 p-3 font-mono text-sm">
              <StreamingDisplay entries={entries} variant="terminal" />
            </div>
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
