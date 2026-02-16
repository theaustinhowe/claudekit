"use client";

import { useEffect, useRef, useState } from "react";
import { Tooltip } from "@/components/ui/tooltip";
import { usePhaseController } from "@/lib/phase-controller";
import { useApp } from "@/lib/store";
import { PHASE_LABELS } from "@/lib/types";
import { ChatBubble } from "./chat-bubble";
import { TypingIndicator } from "./typing-indicator";

export function ChatPanel() {
  const { state } = useApp();
  const controller = usePhaseController();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [inputValue, setInputValue] = useState("");

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on message/typing changes
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [state.messages, state.isTyping]);

  const isEditing = state.editMode !== null;

  const handleSend = () => {
    if (!inputValue.trim()) return;
    const text = inputValue.trim();
    setInputValue("");

    if (isEditing && state.editMode !== null) {
      controller.handleEditSubmit(state.editMode, text);
    } else {
      controller.handleUserMessage(text);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const editModePhase = state.editMode;
  const placeholder =
    isEditing && editModePhase !== null
      ? `Describe your edits for ${PHASE_LABELS[editModePhase]}...`
      : "Type a message...";

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 sm:py-5 space-y-3.5">
        {state.messages.map((msg, i) => (
          <ChatBubble key={msg.id} message={msg} index={i} />
        ))}
        {state.isTyping && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>

      {/* Edit mode banner */}
      {isEditing && (
        <div className="px-4 py-2.5 text-2xs flex items-center gap-2 bg-primary/10 border-t border-primary text-primary">
          <span>✎</span>
          <span>Editing {editModePhase !== null ? PHASE_LABELS[editModePhase] : ""} — describe your changes below</span>
        </div>
      )}

      {/* Input bar */}
      <div
        className="border-t px-3 sm:px-4 py-3 sm:py-3.5"
        style={{ borderColor: isEditing ? "hsl(var(--primary))" : "hsl(var(--border))" }}
      >
        <div
          className="flex items-center gap-2 bg-input rounded-lg"
          style={{
            border: isEditing ? "1px solid hsl(var(--primary))" : "1px solid hsl(var(--input))",
          }}
        >
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="flex-1 bg-transparent px-3.5 py-2.5 text-sm outline-none min-w-0 text-foreground"
          />
          <Tooltip label={isEditing ? "Submit edits" : "Send message"} position="top">
            <button
              type="button"
              onClick={handleSend}
              className={`px-3 py-2 text-2xs font-medium transition-colors shrink-0 ${inputValue.trim() ? "text-primary" : "text-muted-foreground"}`}
            >
              {isEditing ? "Submit" : "Send"}
            </button>
          </Tooltip>
        </div>
        <div className="mt-1.5 text-2xs hidden sm:block text-muted-foreground">
          {isEditing
            ? "Describe what to change · Press Enter to submit edits"
            : "Press Enter to send · The AI guides you through each phase"}
        </div>
      </div>
    </div>
  );
}
