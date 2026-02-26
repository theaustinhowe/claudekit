"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Tooltip } from "@/components/ui/tooltip";
import { usePhaseController } from "@/lib/phase-controller";
import { useApp } from "@/lib/store";
import { getActiveThread, getPhaseThreads } from "@/lib/thread-utils";
import { PHASE_LABELS } from "@/lib/types";
import { ChatBubble } from "./chat-bubble";
import { DecisionSummary } from "./decision-summary";
import { RevisionSection } from "./revision-section";
import { TypingIndicator } from "./typing-indicator";

export function ChatPanel() {
  const { state, dispatch } = useApp();
  const controller = usePhaseController();
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [inputValue, setInputValue] = useState("");
  const [showScrollButton, setShowScrollButton] = useState(false);

  const viewingPhase = state.viewingPhase;
  const activeThread = getActiveThread(state.threads, state.activeThreadIds, viewingPhase);
  const phaseThreads = getPhaseThreads(state.threads, viewingPhase);
  const supersededThreads = phaseThreads.filter((t) => t.status === "superseded");
  const messages = activeThread?.messages ?? [];

  // Check if user has scrolled up
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollButton(distanceFromBottom > 100);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on message/typing changes
  useEffect(() => {
    if (!showScrollButton) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, state.isTyping]);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    setShowScrollButton(false);
  }, []);

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

  const handleCancelEdit = () => {
    dispatch({ type: "SET_EDIT_MODE", phase: null });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === "Escape" && isEditing) {
      handleCancelEdit();
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
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 sm:py-5 space-y-3.5 relative"
        role="log"
        aria-live="polite"
        aria-label="Chat messages"
      >
        {/* Superseded revision sections */}
        {supersededThreads.map((thread) => (
          <RevisionSection key={thread.id} thread={thread} />
        ))}

        {/* Active thread messages */}
        {messages.map((msg, i) => (
          <ChatBubble key={msg.id} message={msg} index={i} />
        ))}
        {state.isTyping && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>

      {/* Decision summary chips */}
      {activeThread && activeThread.decisions.length > 0 && <DecisionSummary decisions={activeThread.decisions} />}

      {/* Scroll to bottom button */}
      {showScrollButton && (
        <div className="absolute bottom-[120px] left-1/2 -translate-x-1/2 z-10">
          <button
            type="button"
            onClick={scrollToBottom}
            className="px-3 py-1.5 text-2xs font-medium bg-card border border-border rounded-full shadow-md transition-all text-muted-foreground"
            style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "hsl(var(--primary))";
              e.currentTarget.style.color = "hsl(var(--primary))";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "hsl(var(--border))";
              e.currentTarget.style.color = "hsl(var(--muted-foreground))";
            }}
          >
            {"\u2193"} New messages
          </button>
        </div>
      )}

      {/* Edit mode banner */}
      {isEditing && (
        <div className="px-4 py-2.5 text-2xs flex items-center gap-2 bg-primary/10 border-t border-primary text-primary">
          <span>{"\u270E"}</span>
          <span className="flex-1">
            Editing {editModePhase !== null ? PHASE_LABELS[editModePhase] : ""} — describe your changes below
          </span>
          <button
            type="button"
            onClick={handleCancelEdit}
            className="px-2 py-0.5 text-2xs rounded-sm transition-colors border border-primary/50 text-primary"
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "hsl(var(--primary) / 0.2)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Input bar */}
      <div
        className="border-t px-3 sm:px-4 py-3 sm:py-3.5"
        style={{ borderColor: isEditing ? "hsl(var(--primary))" : "hsl(var(--border))" }}
      >
        <div
          className="flex items-end gap-2 bg-input rounded-lg"
          style={{
            border: isEditing ? "1px solid hsl(var(--primary))" : "1px solid hsl(var(--input))",
          }}
        >
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="flex-1 bg-transparent px-3.5 py-2.5 text-sm outline-none min-w-0 text-foreground resize-none"
            rows={1}
            style={{
              maxHeight: "120px",
              height: "auto",
            }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = "auto";
              target.style.height = `${Math.min(target.scrollHeight, 120)}px`;
            }}
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
            ? "Describe what to change \u00B7 Press Enter to submit \u00B7 Shift+Enter for new line \u00B7 Esc to cancel"
            : "Press Enter to send \u00B7 Shift+Enter for new line"}
        </div>
      </div>
    </div>
  );
}
