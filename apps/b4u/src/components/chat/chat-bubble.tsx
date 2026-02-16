"use client";

import type { ChatMessage } from "@/lib/types";
import { cn } from "@devkit/ui";
import { ActionCardRenderer } from "./action-card";

interface ChatBubbleProps {
  message: ChatMessage;
  index: number;
}

export function ChatBubble({ message, index }: ChatBubbleProps) {
  const isAI = message.role === "ai";
  const isUser = message.role === "user";

  return (
    <div
      className={cn("flex gap-2 animate-fade-in", isUser && "justify-end")}
      style={{ animationDelay: `${Math.min(index * 30, 150)}ms` }}
    >
      {/* AI avatar */}
      {isAI && (
        <div className="w-[28px] h-[28px] shrink-0 flex items-center justify-center text-2xs font-bold mt-0.5 bg-primary/10 text-primary rounded-full">
          B4U
        </div>
      )}

      <div
        className={cn("max-w-[92%] sm:max-w-[85%] text-sm leading-relaxed rounded-lg text-foreground")}
        style={{
          background: isUser ? "hsl(var(--secondary))" : isAI ? "hsl(var(--card))" : "transparent",
          border: isUser ? "1px solid rgba(196, 161, 255, 0.12)" : isAI ? "1px solid hsl(var(--border))" : "none",
          padding: message.actionCard ? "0" : "12px 16px",
        }}
      >
        {message.content && (
          <div style={{ padding: message.actionCard ? "10px 14px 4px 14px" : "0" }}>{message.content}</div>
        )}
        {message.actionCard && (
          <div style={{ padding: "6px" }}>
            <ActionCardRenderer card={message.actionCard} />
          </div>
        )}
      </div>
    </div>
  );
}
