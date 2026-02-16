"use client";

import type { WsMessage } from "@devkit/gogo-shared";
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Loader2,
  Play,
  RefreshCw,
  Search,
  Square,
  Terminal,
} from "lucide-react";
import { parseAsString, useQueryState } from "nuqs";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { SuggestionCard } from "@/components/research/suggestion-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useRepositoryContext } from "@/contexts/repository-context";
import { useCancelResearch, useResearchSession, useResearchSessions, useStartResearch } from "@/hooks/use-research";

const FOCUS_AREAS = [
  { id: "ui", label: "UI" },
  { id: "ux", label: "UX" },
  { id: "security", label: "Security" },
  { id: "durability", label: "Durability" },
  { id: "performance", label: "Performance" },
  { id: "testing", label: "Testing" },
  { id: "accessibility", label: "Accessibility" },
  { id: "documentation", label: "Documentation" },
] as const;

const CATEGORY_LABELS: Record<string, string> = {
  ui: "UI",
  ux: "UX",
  security: "Security",
  durability: "Durability",
  performance: "Performance",
  testing: "Testing",
  accessibility: "Accessibility",
  documentation: "Documentation",
};

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export default function ResearchPage() {
  const { selectedRepoId, repositories } = useRepositoryContext();
  const { data: sessionsData } = useResearchSessions();
  const { mutate: startResearchMutation, isPending: isStarting } = useStartResearch();
  const { mutate: cancelMutation, isPending: isCancelling } = useCancelResearch();
  const [selectedAreas, setSelectedAreas] = useState<Set<string>>(new Set(["security", "performance", "durability"]));
  const [activeSessionId, setActiveSessionId] = useQueryState("session", parseAsString);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [terminalOpen, setTerminalOpen] = useState(true);

  const { data: activeSessionData } = useResearchSession(activeSessionId);

  const sessions = sessionsData?.data ?? [];
  const runningSession = sessions.find((s) => s.status === "running");
  const activeSession = activeSessionData?.data ?? null;

  // Auto-select: prefer running session, then most recent session
  useEffect(() => {
    if (activeSessionId || sessions.length === 0) return;
    if (runningSession) {
      setActiveSessionId(runningSession.id);
    } else {
      setActiveSessionId(sessions[0].id);
    }
  }, [activeSessionId, sessions, runningSession, setActiveSessionId]);

  const toggleArea = (area: string) => {
    const next = new Set(selectedAreas);
    if (next.has(area)) {
      next.delete(area);
    } else {
      next.add(area);
    }
    setSelectedAreas(next);
  };

  const selectedRepo = selectedRepoId === "all" ? null : (repositories.find((r) => r.id === selectedRepoId) ?? null);

  const doStart = (repoId: string, focusAreas: string[]) => {
    startResearchMutation(
      { repositoryId: repoId, focusAreas },
      {
        onSuccess: (response) => {
          if (response.error) {
            toast.error("Failed to start research", {
              description: response.error,
            });
          } else if (response.data) {
            setActiveSessionId(response.data.id);
            setOutputLines([]);
            setCategoryFilter(null);
            setTerminalOpen(true);
          }
        },
        onError: (err) => {
          toast.error("Failed to start research", {
            description: err.message,
          });
        },
      },
    );
  };

  const handleStart = () => {
    if (!selectedRepo) {
      toast.error("Select a repository in the sidebar first");
      return;
    }
    if (selectedAreas.size === 0) {
      toast.error("Select at least one focus area");
      return;
    }
    doStart(selectedRepo.id, Array.from(selectedAreas));
  };

  const handleRestart = () => {
    if (!activeSession) return;
    doStart(activeSession.repositoryId, activeSession.focusAreas);
  };

  const handleCancel = () => {
    if (!runningSession) return;
    cancelMutation(runningSession.id, {
      onSuccess: () => {
        toast.success("Research cancelled");
      },
    });
  };

  // Stream research output via WebSocket
  const [outputLines, setOutputLines] = useState<string[]>([]);
  const outputEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const msg = (e as CustomEvent).detail as WsMessage;
      if (msg.type === "research:output") {
        const { sessionId, text } = msg.payload as {
          sessionId: string;
          text: string;
        };
        if (sessionId === activeSessionId) {
          setOutputLines((prev) => [...prev, text]);
        }
      }
    };
    window.addEventListener("research-ws", handler);
    return () => window.removeEventListener("research-ws", handler);
  }, [activeSessionId]);

  // Reset state when switching sessions
  const prevActiveSessionRef = useRef(activeSessionId);
  useEffect(() => {
    if (activeSessionId !== prevActiveSessionRef.current) {
      setOutputLines([]);
      setCategoryFilter(null);
      setTerminalOpen(true);
      prevActiveSessionRef.current = activeSessionId;
    }
  }, [activeSessionId]);

  // Auto-scroll terminal
  useEffect(() => {
    if (terminalOpen) {
      outputEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [outputLines.length, terminalOpen]);

  // Auto-collapse terminal when session completes
  const prevStatusRef = useRef(activeSession?.status);
  useEffect(() => {
    if (prevStatusRef.current === "running" && activeSession?.status && activeSession.status !== "running") {
      setTerminalOpen(false);
    }
    prevStatusRef.current = activeSession?.status;
  }, [activeSession?.status]);

  // Sort suggestions by severity
  const allSuggestions = activeSession?.suggestions
    ? [...activeSession.suggestions].sort(
        (a, b) => (SEVERITY_ORDER[a.severity] ?? 2) - (SEVERITY_ORDER[b.severity] ?? 2),
      )
    : [];

  // Category counts for filter badges
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of allSuggestions) {
      counts[s.category] = (counts[s.category] ?? 0) + 1;
    }
    return counts;
  }, [allSuggestions]);

  const categories = Object.keys(categoryCounts).sort();

  // Filtered suggestions
  const suggestions = categoryFilter ? allSuggestions.filter((s) => s.category === categoryFilter) : allSuggestions;

  // Determine terminal content
  const isRunning = activeSession?.status === "running";
  const terminalText = isRunning ? outputLines.join("") : (activeSession?.output ?? null);
  const showTerminal = isRunning || !!terminalText;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex h-12 items-center gap-1 border-b bg-background px-4">
        <span className="text-sm font-medium">Research</span>
        <div className="flex-1" />
        {runningSession && (
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
            </span>
            <span className="text-sm text-muted-foreground">Analyzing...</span>
            <Button variant="outline" size="sm" onClick={handleCancel} disabled={isCancelling}>
              <Square className="h-3 w-3 mr-1" />
              Cancel
            </Button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-hidden flex min-h-0">
        {/* Left panel: Controls + session list */}
        <div className="w-80 border-r flex flex-col shrink-0 overflow-hidden">
          <div className="p-4 space-y-4 border-b">
            {/* Selected repository info */}
            {selectedRepo ? (
              <div className="text-sm">
                <span className="text-muted-foreground">Repository: </span>
                <span className="font-medium">
                  {selectedRepo.displayName || `${selectedRepo.owner}/${selectedRepo.name}`}
                </span>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Select a repository in the sidebar to start research.</p>
            )}

            {/* Focus areas */}
            <div className="space-y-2">
              <span className="text-sm font-medium">Focus Areas</span>
              <div className="flex flex-wrap gap-1.5">
                {FOCUS_AREAS.map((area) => (
                  <button
                    key={area.id}
                    type="button"
                    onClick={() => toggleArea(area.id)}
                    disabled={!!runningSession}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                      selectedAreas.has(area.id)
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                  >
                    {area.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Start button */}
            <Button
              className="w-full"
              onClick={handleStart}
              disabled={isStarting || !!runningSession || !selectedRepo || selectedAreas.size === 0}
            >
              {isStarting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
              {isStarting ? "Starting..." : "Start Research"}
            </Button>
          </div>

          {/* Past sessions */}
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-2">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Sessions</h3>
              {sessions.length === 0 && (
                <p className="text-sm text-muted-foreground py-4 text-center">No research sessions yet</p>
              )}
              {sessions.map((session) => (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => setActiveSessionId(session.id)}
                  className={`w-full text-left rounded-md border p-3 transition-colors cursor-pointer ${
                    activeSessionId === session.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <Badge
                      variant={
                        session.status === "running"
                          ? "default"
                          : session.status === "completed"
                            ? "secondary"
                            : "destructive"
                      }
                      className="text-xs"
                    >
                      {session.status}
                    </Badge>
                    {session.suggestionCount !== undefined && (
                      <span className="text-xs text-muted-foreground">{session.suggestionCount} suggestions</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{new Date(session.createdAt).toLocaleString()}</p>
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Right panel: Suggestions */}
        <div className="flex-1 flex flex-col overflow-hidden min-h-0">
          {activeSession ? (
            <ScrollArea className="flex-1 min-h-0">
              <div className="p-6 space-y-4">
                {/* Session header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-semibold">
                      {suggestions.length}
                      {categoryFilter ? ` ${CATEGORY_LABELS[categoryFilter] ?? categoryFilter}` : ""} Suggestion
                      {suggestions.length !== 1 ? "s" : ""}
                      {categoryFilter && (
                        <span className="text-muted-foreground font-normal"> of {allSuggestions.length}</span>
                      )}
                    </h2>
                    {isRunning && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                  </div>
                  <div className="flex items-center gap-2">
                    {!isRunning && !runningSession && (
                      <Button variant="outline" size="sm" onClick={handleRestart} disabled={isStarting}>
                        {isStarting ? (
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3 w-3 mr-1" />
                        )}
                        Restart
                      </Button>
                    )}
                  </div>
                </div>

                {/* Category filter pills */}
                {categories.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setCategoryFilter(null)}
                      className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                        categoryFilter === null
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                      }`}
                    >
                      All ({allSuggestions.length})
                    </button>
                    {categories.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setCategoryFilter(categoryFilter === cat ? null : cat)}
                        className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                          categoryFilter === cat
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground hover:bg-muted/80"
                        }`}
                      >
                        {CATEGORY_LABELS[cat] ?? cat} ({categoryCounts[cat]})
                      </button>
                    ))}
                  </div>
                )}

                {/* Terminal output */}
                {showTerminal && (
                  <Card>
                    <CardContent className="p-0">
                      <button
                        type="button"
                        onClick={() => {
                          if (!isRunning) setTerminalOpen((o) => !o);
                        }}
                        className={`flex w-full items-center gap-2 px-3 py-2 border-b bg-muted/30 text-left ${
                          isRunning ? "" : "cursor-pointer hover:bg-muted/50"
                        }`}
                      >
                        {isRunning ? (
                          <>
                            <span className="relative flex h-2 w-2">
                              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                              <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
                            </span>
                            <span className="text-xs text-muted-foreground font-medium">Claude is analyzing...</span>
                          </>
                        ) : (
                          <>
                            {terminalOpen ? (
                              <ChevronDown className="h-3 w-3 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-3 w-3 text-muted-foreground" />
                            )}
                            <Terminal className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground font-medium">Session output</span>
                          </>
                        )}
                      </button>
                      {(terminalOpen || isRunning) && (
                        <div className="h-64 overflow-y-auto bg-zinc-950 rounded-b-lg p-3 font-mono text-xs text-zinc-300 leading-relaxed">
                          {!terminalText ? (
                            <span className="text-zinc-500 italic">Waiting for output...</span>
                          ) : (
                            <span className="whitespace-pre-wrap">{terminalText}</span>
                          )}
                          <div ref={outputEndRef} />
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {suggestions.length === 0 && !isRunning && (
                  <Card>
                    <CardContent className="flex items-center justify-center py-12">
                      <div className="text-center">
                        <AlertCircle className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">
                          {categoryFilter
                            ? `No ${CATEGORY_LABELS[categoryFilter] ?? categoryFilter} suggestions in this session.`
                            : "No suggestions found in this session."}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                )}

                <div className="grid gap-4 md:grid-cols-2">
                  {suggestions.map((suggestion) => (
                    <SuggestionCard key={suggestion.id} suggestion={suggestion} sessionId={activeSession.id} />
                  ))}
                </div>
              </div>
            </ScrollArea>
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <Search className="h-12 w-12 mx-auto mb-4 text-muted-foreground/30" />
                <h2 className="text-lg font-semibold mb-2">Analyze Your Codebase</h2>
                <p className="text-sm text-muted-foreground max-w-md">
                  Select a repository and focus areas, then start a research session. Claude will analyze the code and
                  suggest improvements.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
