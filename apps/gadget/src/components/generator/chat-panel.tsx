"use client";

import type { SessionStreamEvent } from "@devkit/hooks";
import { useSessionStream } from "@devkit/hooks";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@devkit/ui/components/alert-dialog";
import { Button } from "@devkit/ui/components/button";
import { Textarea } from "@devkit/ui/components/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@devkit/ui/components/tooltip";
import { Bot, Clock, Loader2, Send, Square, User } from "lucide-react";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { MarkdownRenderer } from "@/components/code/markdown-renderer";
import type { StreamEntry } from "@/components/generator/streaming-display";
import { parseStreamLog, StreamingDisplay } from "@/components/generator/streaming-display";
import type { DesignMessage } from "@/lib/types";

interface ChatPanelProps {
  projectId: string;
  projectName?: string;
  messages: DesignMessage[];
  onNewMessage: (message: DesignMessage) => void;
  upgradeMode?: boolean;
  isQueuing?: boolean;
  onQueueMessage?: (text: string) => void;
}

export interface ChatPanelHandle {
  sendProgrammatic: (text: string) => void;
}

function parseHistoricalLogs(logs: { log: string; logType: string }[]): StreamEntry[] {
  const entries: StreamEntry[] = [];
  for (const l of logs) {
    entries.push(...parseStreamLog(l.log, l.logType));
  }
  return entries;
}

function HistoricalLogs({ logs }: { logs: { log: string; logType: string }[] }) {
  const entries = useMemo(() => parseHistoricalLogs(logs), [logs]);
  if (entries.length === 0) return null;

  return (
    <div className="mb-2">
      <StreamingDisplay entries={entries} variant="chat" />
    </div>
  );
}

function SuggestionChips({
  suggestions,
  onSelect,
  disabled,
}: {
  suggestions: string[];
  onSelect: (text: string) => void;
  disabled: boolean;
}) {
  if (suggestions.length === 0) return null;
  return (
    <div className="flex gap-1.5 px-3 pt-2 pb-2 overflow-x-auto scrollbar-none">
      {suggestions.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onSelect(s)}
          disabled={disabled}
          className="text-xs px-2.5 py-1 rounded-full border bg-background hover:bg-accent hover:border-primary/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap shrink-0"
        >
          {s}
        </button>
      ))}
    </div>
  );
}

export const ChatPanel = forwardRef<ChatPanelHandle, ChatPanelProps>(function ChatPanel(
  { projectId, projectName, messages, onNewMessage, upgradeMode, isQueuing, onQueueMessage },
  ref,
) {
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamContent, setStreamContent] = useState("");
  const [streamEntries, setStreamEntries] = useState<StreamEntry[]>([]);
  const [liveSuggestions, setLiveSuggestions] = useState<string[]>([]);
  const [stopConfirmOpen, setStopConfirmOpen] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const collectedLogsRef = useRef<{ log: string; logType: string }[]>([]);
  const streamContentRef = useRef("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const reconnectAttempted = useRef(false);

  // Reconnect to a running chat session on mount (e.g. after page refresh)
  // biome-ignore lint/correctness/useExhaustiveDependencies: only on mount
  useEffect(() => {
    if (reconnectAttempted.current || sessionId) return;
    reconnectAttempted.current = true;

    fetch(`/api/sessions?status=running,pending&contextType=project&contextId=${projectId}&type=chat&limit=1`)
      .then((res) => (res.ok ? res.json() : []))
      .then((sessions) => {
        if (Array.isArray(sessions) && sessions.length > 0) {
          setStreaming(true);
          setSessionId(sessions[0].id);
        }
      })
      .catch(() => {});
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on message/stream changes
  useEffect(() => {
    requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    });
  }, [messages, streamContent, streamEntries.length]);

  const finalizeMessage = useCallback(
    (content: string, suggestions?: string[] | null) => {
      // Strip suggestion/task_mutation HTML comments from content (server strips too, but
      // the client accumulates raw chunks that still contain them)
      const cleaned = content
        .replace(/\s*<!-- suggestions: \[[\s\S]*?\] -->/g, "")
        .replace(/\s*<!-- task_mutations: \{[\s\S]*?\} -->/g, "")
        .trimEnd();
      const assistantMsg: DesignMessage = {
        id: `msg-${Date.now()}`,
        project_id: projectId,
        role: "assistant",
        content: cleaned || "(Stopped)",
        spec_diff: null,
        model_used: null,
        progress_logs: collectedLogsRef.current.length > 0 ? collectedLogsRef.current : null,
        suggestions: suggestions ?? null,
        created_at: new Date().toISOString(),
      };
      onNewMessage(assistantMsg);
      streamContentRef.current = "";
      setStreaming(false);
      setStreamContent("");
      setStreamEntries([]);
      setLiveSuggestions([]);
      setSessionId(null);
    },
    [projectId, onNewMessage],
  );

  const handleEvent = useCallback((event: SessionStreamEvent) => {
    if (event.log) {
      const logEntry = { log: event.log, logType: event.logType ?? "status" };
      collectedLogsRef.current.push(logEntry);
      const newEntries = parseStreamLog(event.log, event.logType ?? "status");
      setStreamEntries((prev) => [...prev, ...newEntries]);
    }

    // Accumulate text chunks from event.data
    const text = event.data?.text as string | undefined;
    if (text) {
      streamContentRef.current += text;
      setStreamContent(streamContentRef.current);
    }

    // Extract suggestions from event.data
    const suggestions = event.data?.suggestions as string[] | undefined;
    if (suggestions) {
      setLiveSuggestions(suggestions);
    }
  }, []);

  const handleComplete = useCallback(
    (event: SessionStreamEvent) => {
      // Extract suggestions from the completion event and pass to finalized message
      const suggestions = event.data?.suggestions as string[] | undefined;
      finalizeMessage(streamContentRef.current, suggestions);
    },
    [finalizeMessage],
  );

  const session = useSessionStream({
    sessionId,
    autoConnect: true,
    onEvent: handleEvent,
    onComplete: handleComplete,
  });

  const stopStreaming = () => {
    setStopConfirmOpen(true);
  };

  const confirmStop = useCallback(() => {
    setStopConfirmOpen(false);
    session.cancel();
    finalizeMessage(streamContentRef.current);
  }, [session, finalizeMessage]);

  const doSend = useCallback(
    async (text: string) => {
      if (!text || streaming) return;

      setStreaming(true);
      setStreamContent("");
      setStreamEntries([]);
      streamContentRef.current = "";
      collectedLogsRef.current = [];

      // Optimistically add user message
      const userMsg: DesignMessage = {
        id: `temp-${Date.now()}`,
        project_id: projectId,
        role: "user",
        content: text,
        spec_diff: null,
        model_used: null,
        progress_logs: null,
        suggestions: null,
        created_at: new Date().toISOString(),
      };
      onNewMessage(userMsg);

      try {
        const sessionMetadata: Record<string, unknown> = { message: text };
        if (upgradeMode) {
          sessionMetadata.upgradeMode = true;
        }

        const res = await fetch("/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "chat",
            label: `Chat: ${text.slice(0, 50)}`,
            contextType: "project",
            contextId: projectId,
            contextName: projectName || projectId,
            metadata: sessionMetadata,
          }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Chat request failed");
        }

        const data = await res.json();
        setSessionId(data.sessionId);
      } catch (err) {
        const errorMsg: DesignMessage = {
          id: `err-${Date.now()}`,
          project_id: projectId,
          role: "assistant",
          content: `Error: ${err instanceof Error ? err.message : "Something went wrong"}`,
          spec_diff: null,
          model_used: null,
          progress_logs: null,
          suggestions: null,
          created_at: new Date().toISOString(),
        };
        onNewMessage(errorMsg);
        streamContentRef.current = "";
        setStreaming(false);
        setStreamContent("");
        setStreamEntries([]);
        setLiveSuggestions([]);
      }
    },
    [streaming, projectId, projectName, onNewMessage, upgradeMode],
  );

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text) return;

    // Queue mode: store message instead of sending
    if (isQueuing && onQueueMessage) {
      onQueueMessage(text);
      // Add optimistic user message with queued indicator
      const queuedMsg: DesignMessage = {
        id: `queued-${Date.now()}`,
        project_id: projectId,
        role: "user",
        content: text,
        spec_diff: null,
        model_used: null,
        progress_logs: null,
        suggestions: null,
        created_at: new Date().toISOString(),
      };
      onNewMessage(queuedMsg);
      setInput("");
      return;
    }

    setInput("");
    await doSend(text);
  }, [input, isQueuing, onQueueMessage, projectId, onNewMessage, doSend]);

  // Expose sendProgrammatic for external callers (design-workspace queue processing)
  useImperativeHandle(
    ref,
    () => ({
      sendProgrammatic: (text: string) => {
        doSend(text);
      },
    }),
    [doSend],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && !streaming && (
          <div className="text-center py-8">
            <Bot className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">Describe changes to make. For example:</p>
            <p className="text-xs text-muted-foreground mt-1 italic">"Add a settings page with profile editing"</p>
          </div>
        )}

        {messages.map((msg, idx) => {
          // Show suggestions only on the last assistant message when nothing follows it
          const isLastMessage = idx === messages.length - 1;
          const showSuggestions =
            isLastMessage && msg.role === "assistant" && msg.suggestions && msg.suggestions.length > 0 && !streaming;
          const isQueuedMessage = msg.role === "user" && msg.id.startsWith("queued-");

          return (
            <div key={msg.id}>
              <div className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                    msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
                  }`}
                >
                  {msg.role === "user" ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                </div>
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                    msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
                  }`}
                >
                  {msg.role === "assistant" ? (
                    <>
                      {msg.progress_logs && msg.progress_logs.length > 0 && <HistoricalLogs logs={msg.progress_logs} />}
                      <div className="[&>div>p]:mb-2 [&>div>p:last-child]:mb-0">
                        <MarkdownRenderer content={msg.content} />
                      </div>
                    </>
                  ) : (
                    <div>
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                      {isQueuedMessage && <span className="text-[10px] opacity-70 mt-0.5 block">(queued)</span>}
                    </div>
                  )}
                </div>
              </div>
              {showSuggestions && (
                <SuggestionChips
                  suggestions={msg.suggestions ?? []}
                  onSelect={(text) => {
                    setInput(text);
                  }}
                  disabled={streaming}
                />
              )}
            </div>
          );
        })}

        {/* Streaming content */}
        {streaming && (
          <div>
            <div className="flex gap-3">
              <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 bg-muted">
                <Bot className="w-4 h-4" />
              </div>
              <div className="max-w-[85%] rounded-lg px-3 py-2 text-sm bg-muted">
                {/* Progress logs (tool calls, thinking) */}
                {streamEntries.length > 0 && (
                  <div className="mb-2">
                    <StreamingDisplay entries={streamEntries} variant="chat" live />
                  </div>
                )}
                {streamContent ? (
                  <div className="[&>div>p]:mb-2 [&>div>p:last-child]:mb-0">
                    <MarkdownRenderer
                      content={streamContent
                        .replace(/\s*<!-- suggestions: \[[\s\S]*?\] -->/g, "")
                        .replace(/\s*<!-- task_mutations: \{[\s\S]*?\} -->/g, "")}
                    />
                  </div>
                ) : (
                  <Loader2 className="w-4 h-4 animate-spin" />
                )}
              </div>
            </div>
            {liveSuggestions.length > 0 && (
              <SuggestionChips
                suggestions={liveSuggestions}
                onSelect={(text) => {
                  setInput(text);
                }}
                disabled={streaming}
              />
            )}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t p-3">
        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isQueuing ? "Message will be sent after current task..." : "Describe changes to make..."}
            className="min-h-[44px] max-h-[120px] resize-none text-sm"
            disabled={streaming}
          />
          <TooltipProvider>
            <div className="flex flex-col items-center gap-1 shrink-0">
              <Tooltip>
                <TooltipTrigger asChild>
                  {streaming ? (
                    <Button size="icon" variant="destructive" onClick={stopStreaming}>
                      <Square className="w-3.5 h-3.5" />
                    </Button>
                  ) : isQueuing ? (
                    <Button size="icon" variant="secondary" onClick={sendMessage} disabled={!input.trim()}>
                      <Clock className="w-4 h-4" />
                    </Button>
                  ) : (
                    <Button size="icon" onClick={sendMessage} disabled={!input.trim()}>
                      <Send className="w-4 h-4" />
                    </Button>
                  )}
                </TooltipTrigger>
                <TooltipContent>{streaming ? "Stop" : isQueuing ? "Queue message" : "Send message"}</TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        </div>
      </div>

      <AlertDialog open={stopConfirmOpen} onOpenChange={setStopConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stop generation?</AlertDialogTitle>
            <AlertDialogDescription>
              This will stop the agent mid-response. Any changes already made to files will remain.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continue</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmStop}
            >
              Stop
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
});
