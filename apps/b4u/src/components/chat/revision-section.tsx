"use client";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@claudekit/ui/components/tooltip";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import type { PhaseThread } from "@/lib/types";
import { ChatBubble } from "./chat-bubble";

interface RevisionSectionProps {
  thread: PhaseThread;
}

export function RevisionSection({ thread }: RevisionSectionProps) {
  const [expanded, setExpanded] = useState(false);

  if (thread.messages.length === 0) return null;

  const timestamp = new Date(thread.createdAt).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className="border border-border/50 rounded-lg overflow-hidden mb-3">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-2 w-full px-3 py-2 text-2xs text-muted-foreground hover:bg-muted/50 transition-colors"
            >
              {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              <span className="font-medium">Revision {thread.revision}</span>
              <span className="text-muted-foreground/60">{timestamp}</span>
              <span className="ml-auto text-muted-foreground/50">{thread.messages.length} messages</span>
            </button>
          </TooltipTrigger>
          <TooltipContent>Toggle section</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {expanded && (
        <div className="px-4 py-3 space-y-3 opacity-60 border-t border-border/50">
          {thread.messages.map((msg, i) => (
            <ChatBubble key={msg.id} message={msg} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
