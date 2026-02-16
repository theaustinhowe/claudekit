"use client";

import { Activity } from "lucide-react";
import { useSessionContext } from "@/components/sessions/session-context";
import { Button } from "@devkit/ui/components/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@devkit/ui/components/tooltip";

export function SessionIndicator() {
  const { activeCount, setPanelOpen } = useSessionContext();

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={`h-8 gap-1.5 px-2 text-xs ${activeCount === 0 ? "text-muted-foreground" : ""}`}
            onClick={() => setPanelOpen(true)}
          >
            {activeCount > 0 ? (
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
            ) : (
              <span className="relative inline-flex rounded-full h-2 w-2 bg-muted-foreground/40" />
            )}
            <Activity className="w-3.5 h-3.5" />
            <span>{activeCount}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {activeCount > 0 ? `${activeCount} active session${activeCount !== 1 ? "s" : ""}` : "Sessions — none active"}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
