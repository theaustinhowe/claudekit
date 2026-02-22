"use client";

import type { UseSessionStreamReturn } from "@devkit/hooks";
import { Button } from "@devkit/ui/components/button";
import { Progress } from "@devkit/ui/components/progress";
import { Check, Square } from "lucide-react";
import { motion } from "motion/react";
import type { ReactNode } from "react";

interface SessionProgressProps {
  stream: UseSessionStreamReturn;
  icon: ReactNode;
  title?: string;
  subtitle?: string;
}

export function SessionProgress({ stream, icon, title, subtitle }: SessionProgressProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8">
      {icon}
      {title && <h2 className="text-xl font-bold mb-2">{title}</h2>}
      {subtitle && <p className="text-sm text-muted-foreground mb-6">{subtitle}</p>}
      <div className="w-full max-w-md space-y-6">
        <Progress value={stream.progress ?? 0} className="h-2" />
        {stream.phase && <p className="text-center text-sm font-medium">{stream.phase}</p>}
        <div className="space-y-1.5 max-h-48 overflow-y-auto">
          {stream.logs.slice(-8).map((entry: { log: string; logType: string }, i: number) => (
            <motion.div
              key={`${i}-${entry.log}`}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-2 text-sm"
            >
              {entry.log.includes("[SUCCESS]") ? (
                <Check className="h-4 w-4 text-status-success shrink-0" />
              ) : (
                <div className="h-4 w-4 rounded-full border-2 border-primary animate-spin border-t-transparent shrink-0" />
              )}
              <span className="text-muted-foreground truncate">{entry.log}</span>
            </motion.div>
          ))}
        </div>
        {stream.elapsed > 0 && <p className="text-center text-xs text-muted-foreground">{stream.elapsed}s elapsed</p>}
        <Button variant="outline" className="w-full" onClick={stream.cancel}>
          <Square className="h-3 w-3 mr-2" />
          Cancel
        </Button>
      </div>
    </div>
  );
}
