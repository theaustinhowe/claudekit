"use client";

import { useAutoScroll } from "@devkit/hooks";
import { Button } from "@devkit/ui/components/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@devkit/ui/components/tooltip";
import { ArrowDown, Check, ClipboardCopy } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AutoFixIndicator } from "@/components/generator/auto-fix-indicator";

interface DevServerLogsProps {
  projectId: string;
  projectPath?: string;
  autoFixEnabled?: boolean;
  onToggleAutoFix?: (enabled: boolean) => void;
}

const MAX_LINES = 200;

export function DevServerLogs({ projectId, projectPath, autoFixEnabled, onToggleAutoFix }: DevServerLogsProps) {
  const [lines, setLines] = useState<string[]>([]);
  const { containerRef, isAtBottom, scrollToBottom } = useAutoScroll();
  const [hasNewOutput, setHasNewOutput] = useState(false);
  const [copied, setCopied] = useState(false);
  const prevLengthRef = useRef(0);

  useEffect(() => {
    let mounted = true;

    const poll = async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/dev-server`);
        if (!res.ok || !mounted) return;
        const data = await res.json();
        if (data.logs && mounted) {
          const newLines = (data.logs as string[]).slice(-MAX_LINES);
          setLines(newLines);
          if (newLines.length > prevLengthRef.current) {
            setHasNewOutput(true);
          }
          prevLengthRef.current = newLines.length;
        }
      } catch {
        // Silently ignore polling errors
      }
    };

    poll();
    const interval = setInterval(poll, 2000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [projectId]);

  // Auto-scroll on new lines when user is near bottom
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll when lines change
  useEffect(() => {
    if (isAtBottom) {
      scrollToBottom();
      setHasNewOutput(false);
    }
  }, [lines.length]);

  const handleCopy = useCallback(async () => {
    const text = lines.join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  }, [lines]);

  const handleScrollToBottom = useCallback(() => {
    scrollToBottom();
    setHasNewOutput(false);
  }, [scrollToBottom]);

  return (
    <div className="bg-zinc-950 rounded-lg border border-zinc-800 flex flex-col overflow-hidden h-full relative">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-zinc-800">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500/80" />
          <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
          <div className="w-3 h-3 rounded-full bg-green-500/80" />
        </div>
        <span className="text-xs font-medium text-zinc-400 ml-2">Dev Server</span>
        <div className="ml-auto flex items-center gap-1">
          {lines.length > 0 && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
                    onClick={handleCopy}
                    aria-label="Copy output"
                  >
                    {copied ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <ClipboardCopy className="w-3.5 h-3.5" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Copy output</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {projectPath && onToggleAutoFix && (
            <AutoFixIndicator projectId={projectId} enabled={autoFixEnabled ?? false} onToggle={onToggleAutoFix} />
          )}
        </div>
      </div>

      <div
        ref={containerRef}
        role="log"
        aria-live="polite"
        aria-label="Dev server output"
        className="flex-1 overflow-y-auto p-4 font-mono text-xs text-zinc-300 leading-relaxed"
      >
        {lines.length === 0 ? (
          <span className="text-zinc-600">Waiting for output...</span>
        ) : (
          lines.map((line, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: log lines are append-only
            <div key={i} className="whitespace-pre-wrap break-all">
              {line}
            </div>
          ))
        )}
      </div>

      {/* Scroll-to-bottom indicator */}
      {!isAtBottom && hasNewOutput && (
        <button
          type="button"
          onClick={handleScrollToBottom}
          className="absolute bottom-4 right-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-full px-3 py-1.5 text-xs flex items-center gap-1.5 shadow-lg border border-zinc-700 transition-colors z-10"
        >
          <ArrowDown className="w-3 h-3" />
          New output
        </button>
      )}
    </div>
  );
}
