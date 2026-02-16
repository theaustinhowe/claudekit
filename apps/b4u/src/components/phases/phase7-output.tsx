"use client";

import { useState } from "react";
import { ErrorState, LoadingState } from "@/components/ui/api-state";
import { Tooltip } from "@/components/ui/tooltip";
import type { ChapterMarker } from "@/lib/types";
import { useApi } from "@/lib/use-api";

const MOCK_SCENES = [
  { label: "New User Onboarding", color: "#1e3a5f" },
  { label: "Project Creation", color: "#2d1e5f" },
  { label: "Billing Upgrade", color: "#1e5f3a" },
  { label: "Daily Review", color: "#5f3a1e" },
];

export function Phase7Output() {
  const { data: chapterMarkers, loading, error, refetch } = useApi<ChapterMarker[]>("/api/chapter-markers");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentScene, setCurrentScene] = useState(0);
  const [progress, setProgress] = useState(0);

  if (loading) return <LoadingState label="Preparing final output..." />;
  if (error || !chapterMarkers) return <ErrorState message={error || "No chapter data"} onRetry={refetch} />;

  const handlePlay = () => {
    if (isPlaying) {
      setIsPlaying(false);
      return;
    }
    setIsPlaying(true);
    setProgress(0);
    setCurrentScene(0);

    let tick = 0;
    const interval = setInterval(() => {
      tick += 1;
      const pct = Math.min((tick / 60) * 100, 100);
      setProgress(pct);
      setCurrentScene(Math.min(Math.floor(pct / 25), MOCK_SCENES.length - 1));
      if (tick >= 60) {
        clearInterval(interval);
        setIsPlaying(false);
      }
    }, 200);
  };

  const scene = MOCK_SCENES[currentScene];

  return (
    <div className="h-full flex flex-col animate-slide-in-right">
      <div className="px-4 py-3 border-b border-border text-xs font-medium flex items-center gap-2 text-muted-foreground bg-card">
        <span className="text-success">▶</span>
        FINAL OUTPUT
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Video player */}
        <div className="bg-background border border-border rounded-lg overflow-hidden">
          {/* Video area */}
          <div
            className="relative aspect-video flex items-center justify-center transition-colors"
            style={{
              background: scene.color,
              transition: "background-color 500ms ease",
            }}
          >
            {/* Play overlay */}
            <button
              type="button"
              onClick={handlePlay}
              className="absolute inset-0 flex items-center justify-center group"
            >
              {!isPlaying && (
                <Tooltip label="Play video" position="bottom">
                  <div
                    className="w-[52px] h-[52px] flex items-center justify-center transition-all group-hover:scale-110 rounded-lg text-primary"
                    style={{
                      background: "rgba(0,0,0,0.5)",
                      border: "1.5px solid hsl(var(--primary))",
                    }}
                  >
                    ▶
                  </div>
                </Tooltip>
              )}
            </button>

            {/* Scene label */}
            <div className="text-center pointer-events-none">
              <div className="text-lg font-semibold" style={{ color: "rgba(255,255,255,0.8)" }}>
                {scene.label}
              </div>
              <div className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.4)" }}>
                B4U Dashboard — Feature Walkthrough
              </div>
            </div>

            {/* Recording indicator */}
            {isPlaying && (
              <div
                className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 text-2xs text-destructive rounded-sm"
                style={{
                  background: "rgba(0,0,0,0.6)",
                  border: "1px solid hsl(var(--destructive))",
                }}
              >
                <span className="animate-pulse">●</span>
                PLAYING
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="flex items-center gap-3 px-3 py-2.5 border-t border-border">
            <Tooltip label={isPlaying ? "Pause" : "Play"} position="top">
              <button
                type="button"
                onClick={handlePlay}
                className="text-xs w-[24px] h-[24px] flex items-center justify-center text-primary"
              >
                {isPlaying ? "⏸" : "▶"}
              </button>
            </Tooltip>
            <div className="flex-1 relative h-[3px] bg-muted" style={{ borderRadius: "99px" }}>
              <div
                className="absolute inset-y-0 left-0 transition-all bg-primary"
                style={{
                  width: `${progress}%`,
                  borderRadius: "99px",
                  transition: "width 200ms linear",
                }}
              />
            </div>
            <span className="text-2xs text-muted-foreground">{formatTime(progress)} / 1:18</span>
            <Tooltip label="Fullscreen" position="top">
              <button
                type="button"
                className="text-xs w-[24px] h-[24px] flex items-center justify-center text-muted-foreground/70"
              >
                ⛶
              </button>
            </Tooltip>
          </div>
        </div>

        {/* Chapter markers */}
        <div>
          <div className="text-2xs mb-2 text-muted-foreground">CHAPTERS</div>
          <div className="space-y-1.5">
            {chapterMarkers.map((chapter, i) => (
              <button
                type="button"
                // biome-ignore lint/suspicious/noArrayIndexKey: chapter markers have no stable key
                key={i}
                onClick={() => {
                  setCurrentScene(i);
                  setProgress((i / chapterMarkers.length) * 100);
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left transition-all rounded-md"
                style={{
                  background: currentScene === i ? "hsl(var(--primary) / 0.1)" : "hsl(var(--card))",
                  border: currentScene === i ? "1px solid hsl(var(--primary))" : "1px solid hsl(var(--border))",
                }}
                onMouseEnter={(e) => {
                  if (currentScene !== i) e.currentTarget.style.background = "hsl(var(--muted))";
                }}
                onMouseLeave={(e) => {
                  if (currentScene !== i) e.currentTarget.style.background = "hsl(var(--card))";
                }}
              >
                <span className="text-2xs w-[36px] shrink-0 text-primary">{chapter.startTime}</span>
                <span className="text-xs text-foreground">{chapter.flowName}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2">
          {[
            { label: "Download Video", icon: "↓", tip: "Download as MP4 video" },
            { label: "Download Audio", icon: "♫", tip: "Download audio track" },
            { label: "Download Script", icon: "⊞", tip: "Download narration script" },
            { label: "Re-record", icon: "↻", tip: "Re-record all flows" },
            { label: "Edit Voiceover", icon: "✎", tip: "Go back to voiceover editor" },
          ].map((action) => (
            <Tooltip key={action.label} label={action.tip} position="top">
              <button
                type="button"
                className="flex items-center gap-2 px-3 py-2.5 text-2xs font-medium transition-all bg-card border border-border rounded-md text-muted-foreground"
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "hsl(var(--primary))";
                  e.currentTarget.style.color = "hsl(var(--primary))";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "hsl(var(--border))";
                  e.currentTarget.style.color = "hsl(var(--muted-foreground))";
                }}
              >
                <span>{action.icon}</span>
                {action.label}
              </button>
            </Tooltip>
          ))}
        </div>
      </div>
    </div>
  );
}

function formatTime(pct: number): string {
  const totalSec = Math.floor((pct / 100) * 78);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}
