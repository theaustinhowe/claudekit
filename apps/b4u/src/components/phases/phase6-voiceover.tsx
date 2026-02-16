"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ErrorState, LoadingState } from "@/components/ui/api-state";
import { Tooltip } from "@/components/ui/tooltip";
import type { FlowScript, TimelineMarker, VoiceOption } from "@/lib/types";
import { useApi } from "@/lib/use-api";

export function Phase6Voiceover() {
  const { data: flowScripts, loading: l1, error: e1, refetch: rf1 } = useApi<FlowScript[]>("/api/flow-scripts");
  const {
    data: voiceoverScripts,
    loading: l2,
    error: e2,
    refetch: rf2,
  } = useApi<Record<string, string[]>>("/api/voiceover-scripts");
  const { data: voiceOptions, loading: l3, error: e3, refetch: rf3 } = useApi<VoiceOption[]>("/api/voice-options");
  const {
    data: timelineMarkers,
    loading: l4,
    error: e4,
    refetch: rf4,
  } = useApi<Record<string, TimelineMarker[]>>("/api/timeline-markers");

  const [activeFlow, setActiveFlow] = useState<string | null>(null);
  const [selectedVoice, setSelectedVoice] = useState<string | null>(null);
  const [speed, setSpeed] = useState(1.0);
  const [hoveredParagraph, setHoveredParagraph] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [editedScripts, setEditedScripts] = useState<Record<string, string[]>>({});
  const [editingParagraph, setEditingParagraph] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [paragraphErrors, setParagraphErrors] = useState<Record<string, Record<number, string>>>({});
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const MAX_PARAGRAPH_LENGTH = 5000;

  // Set defaults once data loads
  useEffect(() => {
    if (flowScripts && flowScripts.length > 0 && activeFlow === null) {
      setActiveFlow(flowScripts[0].flowId);
    }
  }, [flowScripts, activeFlow]);

  useEffect(() => {
    if (voiceOptions && voiceOptions.length > 0 && selectedVoice === null) {
      setSelectedVoice(voiceOptions[0].id);
    }
  }, [voiceOptions, selectedVoice]);

  useEffect(() => {
    if (voiceoverScripts) {
      setEditedScripts(voiceoverScripts);
    }
  }, [voiceoverScripts]);

  const saveVoiceovers = useCallback(async (scripts: Record<string, string[]>) => {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/voiceover-scripts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(scripts),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to save voiceover scripts");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save";
      setSaveError(msg);
      console.error("Failed to save voiceover scripts:", err);
    } finally {
      setSaving(false);
    }
  }, []);

  const debouncedSave = useCallback(
    (scripts: Record<string, string[]>) => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        saveVoiceovers(scripts);
      }, 800);
    },
    [saveVoiceovers],
  );

  const updateParagraph = (flowId: string, index: number, text: string) => {
    // Validate paragraph length
    if (text.length > MAX_PARAGRAPH_LENGTH) {
      setParagraphErrors((prev) => ({
        ...prev,
        [flowId]: {
          ...prev[flowId],
          [index]: `Paragraph must be under ${MAX_PARAGRAPH_LENGTH} characters (${text.length})`,
        },
      }));
      // Still update locally so user can see what they typed, but don't save
      const updated = {
        ...editedScripts,
        [flowId]: editedScripts[flowId].map((p, i) => (i === index ? text : p)),
      };
      setEditedScripts(updated);
      return;
    }
    // Clear error for this paragraph
    setParagraphErrors((prev) => {
      const flowErrs = { ...prev[flowId] };
      delete flowErrs[index];
      const next = { ...prev };
      if (Object.keys(flowErrs).length === 0) delete next[flowId];
      else next[flowId] = flowErrs;
      return next;
    });
    const updated = {
      ...editedScripts,
      [flowId]: editedScripts[flowId].map((p, i) => (i === index ? text : p)),
    };
    setEditedScripts(updated);
    debouncedSave(updated);
  };

  const loading = l1 || l2 || l3 || l4;
  const error = e1 || e2 || e3 || e4;

  if (loading) return <LoadingState label="Loading voiceover editor..." />;
  if (error || !flowScripts || !voiceoverScripts || !voiceOptions || !timelineMarkers) {
    return (
      <ErrorState
        message={error || "No voiceover data"}
        onRetry={() => {
          rf1();
          rf2();
          rf3();
          rf4();
        }}
      />
    );
  }

  const paragraphs = activeFlow ? editedScripts[activeFlow] || [] : [];
  const markers = activeFlow ? timelineMarkers[activeFlow] || [] : [];

  return (
    <div className="h-full flex flex-col animate-slide-in-right">
      {/* Flow selector */}
      <div className="flex border-b border-border overflow-x-auto shrink-0 bg-card">
        {flowScripts.map((f) => (
          <button
            type="button"
            key={f.flowId}
            onClick={() => {
              setActiveFlow(f.flowId);
              setEditingParagraph(null);
            }}
            className="px-3 py-2.5 text-2xs font-medium whitespace-nowrap transition-colors relative"
            style={{
              color: activeFlow === f.flowId ? "hsl(var(--primary))" : "hsl(var(--muted-foreground) / 0.7)",
              background: activeFlow === f.flowId ? "hsl(var(--primary) / 0.1)" : "transparent",
            }}
          >
            {f.flowName}
            {activeFlow === f.flowId && <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-primary" />}
          </button>
        ))}
        <span
          className="text-2xs px-3 py-2.5 ml-auto"
          style={{ color: saveError ? "hsl(var(--destructive))" : "hsl(var(--muted-foreground))" }}
        >
          {saveError ? saveError : saving ? "Saving..." : ""}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto flex flex-col">
        {/* Timeline */}
        <div className="p-4 border-b border-border shrink-0">
          <div className="text-2xs mb-2 text-muted-foreground">TIMELINE</div>
          <div className="h-[48px] relative flex items-end bg-card border border-border rounded-md overflow-hidden">
            {/* Frame thumbnails (colored blocks) */}
            <div className="absolute inset-0 flex">
              {markers.map((marker, i) => {
                const widthPct = 100 / markers.length;
                const colors = ["#1e3a5f", "#2d1e5f", "#1e5f3a", "#5f3a1e"];
                return (
                  <button
                    // biome-ignore lint/suspicious/noArrayIndexKey: timeline markers have no stable key
                    key={i}
                    type="button"
                    className="h-full flex items-center justify-center cursor-pointer transition-opacity"
                    style={{
                      width: `${widthPct}%`,
                      background: colors[i % colors.length],
                      opacity: hoveredParagraph === marker.paragraphIndex ? 1 : 0.6,
                      borderRight: i < markers.length - 1 ? "1px solid hsl(var(--border))" : "none",
                    }}
                    onMouseEnter={() => setHoveredParagraph(marker.paragraphIndex)}
                    onMouseLeave={() => setHoveredParagraph(null)}
                  >
                    <div className="text-center">
                      <div className="text-2xs" style={{ color: "rgba(255,255,255,0.7)" }}>
                        {marker.timestamp}
                      </div>
                      <div className="text-2xs" style={{ color: "rgba(255,255,255,0.4)" }}>
                        {marker.label}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Voice settings bar */}
        <div className="flex items-center gap-3 px-4 py-2 border-b border-border shrink-0 bg-card">
          <div className="flex items-center gap-2">
            <label className="text-2xs text-muted-foreground">
              VOICE
              <select
                value={selectedVoice || ""}
                onChange={(e) => setSelectedVoice(e.target.value)}
                className="text-xs px-2 py-1 outline-none cursor-pointer bg-input border border-input rounded-sm text-foreground"
              >
                {voiceOptions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} — {v.style}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-2xs text-muted-foreground">
              SPEED
              <input
                type="range"
                min="0.5"
                max="2.0"
                step="0.1"
                value={speed}
                onChange={(e) => setSpeed(parseFloat(e.target.value))}
                className="w-[60px] accent-primary"
              />
            </label>
            <span className="text-2xs w-[28px] text-muted-foreground">{speed.toFixed(1)}x</span>
          </div>

          <Tooltip label={isPlaying ? "Stop audio preview" : "Preview voiceover audio"} position="top">
            <button
              type="button"
              onClick={() => setIsPlaying(!isPlaying)}
              className="ml-auto px-3 py-1.5 text-2xs font-medium transition-colors rounded-sm"
              style={{
                background: isPlaying ? "hsl(var(--primary))" : "hsl(var(--muted))",
                color: isPlaying ? "hsl(var(--background))" : "hsl(var(--primary))",
                border: "1px solid hsl(var(--primary))",
              }}
            >
              {isPlaying ? "■ Stop" : "▶ Preview Audio"}
            </button>
          </Tooltip>
        </div>

        {/* Voiceover script */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div className="text-2xs mb-1 flex items-center justify-between text-muted-foreground">
            <span>NARRATION SCRIPT</span>
            <span>Click to edit</span>
          </div>
          {paragraphs.map((para, i) => {
            const paraError = activeFlow ? paragraphErrors[activeFlow]?.[i] : undefined;
            return (
              // biome-ignore lint/a11y/noStaticElementInteractions: hover highlight for visual feedback only
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: paragraphs have no stable key
                key={i}
                role="presentation"
                className="p-3.5 transition-all"
                style={{
                  background: paraError
                    ? "rgba(239, 68, 68, 0.05)"
                    : hoveredParagraph === i
                      ? "hsl(var(--primary) / 0.1)"
                      : "hsl(var(--card))",
                  border: paraError
                    ? "1px solid hsl(var(--destructive))"
                    : editingParagraph === i
                      ? "1px solid hsl(var(--primary))"
                      : hoveredParagraph === i
                        ? "1px solid hsl(var(--primary))"
                        : "1px solid hsl(var(--border))",
                  borderRadius: "calc(var(--radius) - 2px)",
                  color: "hsl(var(--muted-foreground))",
                }}
                onMouseEnter={() => setHoveredParagraph(i)}
                onMouseLeave={() => setHoveredParagraph(null)}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-2xs font-medium text-primary">¶{i + 1}</span>
                  {markers[i] && <span className="text-2xs text-muted-foreground">@ {markers[i].timestamp}</span>}
                </div>
                {editingParagraph === i ? (
                  <textarea
                    // biome-ignore lint/a11y/noAutofocus: auto-focus on edit is intentional UX
                    autoFocus
                    value={para}
                    onChange={(e) => activeFlow && updateParagraph(activeFlow, i, e.target.value)}
                    onBlur={() => setEditingParagraph(null)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") setEditingParagraph(null);
                    }}
                    className="w-full text-xs leading-relaxed outline-none resize-none text-muted-foreground"
                    style={{
                      background: "transparent",
                      minHeight: "60px",
                    }}
                    rows={3}
                  />
                ) : (
                  <button
                    type="button"
                    className="text-xs leading-relaxed cursor-text text-left w-full bg-transparent border-none p-0"
                    onClick={() => setEditingParagraph(i)}
                  >
                    {para}
                  </button>
                )}
                {paraError && <div className="text-2xs mt-1 text-destructive">{paraError}</div>}
              </div>
            );
          })}

          {/* Waveform mock */}
          {isPlaying && (
            <div className="mt-2 p-3 bg-card border border-primary rounded-md">
              <div className="flex items-center gap-1 h-[24px]">
                {Array.from({ length: 40 }).map((_, i) => (
                  <div
                    // biome-ignore lint/suspicious/noArrayIndexKey: decorative waveform bars have no stable key
                    key={i}
                    className="flex-1"
                    style={{
                      background: "hsl(var(--primary))",
                      height: `${Math.random() * 100}%`,
                      minHeight: "2px",
                      opacity: 0.6,
                      animation: `pulse ${0.8 + Math.random()}s ease-in-out infinite`,
                      animationDelay: `${i * 30}ms`,
                    }}
                  />
                ))}
              </div>
              <div className="text-2xs mt-1 text-center text-primary">
                Playing preview — {voiceOptions.find((v) => v.id === selectedVoice)?.name}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
