"use client";

import { Bot } from "lucide-react";

export function TypingIndicator() {
  return (
    <div className="flex gap-2 animate-fade-in">
      <div className="w-[28px] h-[28px] shrink-0 flex items-center justify-center bg-primary/10 text-primary rounded-full">
        <Bot size={16} />
      </div>
      <div className="px-3 py-2 flex items-center gap-1 bg-card border border-border rounded-lg">
        <span
          className="w-[4px] h-[4px] rounded-full bg-primary"
          style={{
            animation: "typing 1.4s infinite",
            animationDelay: "0ms",
          }}
        />
        <span
          className="w-[4px] h-[4px] rounded-full bg-primary"
          style={{
            animation: "typing 1.4s infinite",
            animationDelay: "200ms",
          }}
        />
        <span
          className="w-[4px] h-[4px] rounded-full bg-primary"
          style={{
            animation: "typing 1.4s infinite",
            animationDelay: "400ms",
          }}
        />
      </div>
    </div>
  );
}
