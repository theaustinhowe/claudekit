"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ErrorState } from "@/components/ui/api-state";
import { Phase7OutputSkeleton } from "@/components/ui/phase-skeletons";
import { Tooltip } from "@/components/ui/tooltip";
import { usePhaseController } from "@/lib/phase-controller";
import { useApp } from "@/lib/store";
import type { ChapterMarker } from "@/lib/types";
import { useApi } from "@/lib/use-api";
import { PhaseGoalBanner } from "./phase-goal-banner";

interface VideoInfo {
  id: string;
  durationSeconds: number;
}

export function Phase7Output() {
  const { state } = useApp();
  const {
    data: chapterMarkers,
    loading: l1,
    error: e1,
    refetch: rf1,
  } = useApi<ChapterMarker[]>(`/api/chapter-markers?runId=${state.runId}`, state.panelRefreshKey);
  const {
    data: videoInfo,
    loading: l2,
    error: e2,
    refetch: rf2,
  } = useApi<VideoInfo>(`/api/video/info?runId=${state.runId}`, state.panelRefreshKey);
  const controller = usePhaseController();

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [activeChapter, setActiveChapter] = useState(0);
  const [videoError, setVideoError] = useState(false);

  const loading = l1 || l2;
  const error = e1 || e2;

  // Sync duration from video element or fallback to DB
  useEffect(() => {
    if (videoInfo) {
      setDuration(videoInfo.durationSeconds);
    }
  }, [videoInfo]);

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    setCurrentTime(video.currentTime);
    if (!Number.isNaN(video.duration) && video.duration > 0) {
      setDuration(video.duration);
    }
  }, []);

  const handlePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying) {
      video.pause();
    } else {
      video.play().catch(() => {});
    }
  }, [isPlaying]);

  const handleSeek = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const video = videoRef.current;
      if (!video || !duration) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      video.currentTime = pct * duration;
    },
    [duration],
  );

  const jumpToChapter = useCallback(
    (index: number) => {
      const video = videoRef.current;
      if (!video || !chapterMarkers) return;
      const marker = chapterMarkers[index];
      if (!marker) return;
      const seconds = parseTimeToSeconds(marker.startTime);
      video.currentTime = seconds;
      setActiveChapter(index);
      if (!isPlaying) {
        video.play().catch(() => {});
      }
    },
    [chapterMarkers, isPlaying],
  );

  const handleFullscreen = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      container.requestFullscreen().catch(() => {});
    }
  }, []);

  const handleMuteToggle = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const video = videoRef.current;
      if (!video) return;

      switch (e.key) {
        case " ":
          e.preventDefault();
          handlePlay();
          break;
        case "ArrowLeft":
          e.preventDefault();
          video.currentTime = Math.max(0, video.currentTime - 5);
          break;
        case "ArrowRight":
          e.preventDefault();
          video.currentTime = Math.min(duration, video.currentTime + 5);
          break;
        case "ArrowUp":
          e.preventDefault();
          video.volume = Math.min(1, video.volume + 0.1);
          break;
        case "ArrowDown":
          e.preventDefault();
          video.volume = Math.max(0, video.volume - 0.1);
          break;
        case "f":
        case "F":
          e.preventDefault();
          handleFullscreen();
          break;
        case "m":
        case "M":
          e.preventDefault();
          handleMuteToggle();
          break;
      }
    },
    [duration, handlePlay, handleFullscreen, handleMuteToggle],
  );

  const handleDownloadAudio = useCallback(async () => {
    try {
      const res = await fetch(`/api/voiceover-scripts?runId=${state.runId}`);
      if (!res.ok) return;
      // Trigger audio download — the combined audio is available at the same path as video
      const a = document.createElement("a");
      a.href = "/api/audio/serve";
      a.download = "walkthrough-audio.mp3";
      a.click();
    } catch {
      // ignore download errors
    }
  }, [state.runId]);

  // Update active chapter based on current time
  useEffect(() => {
    if (!chapterMarkers || chapterMarkers.length === 0) return;
    let active = 0;
    for (let i = chapterMarkers.length - 1; i >= 0; i--) {
      if (currentTime >= parseTimeToSeconds(chapterMarkers[i].startTime)) {
        active = i;
        break;
      }
    }
    setActiveChapter(active);
  }, [currentTime, chapterMarkers]);

  const handleDownloadVideo = useCallback(() => {
    if (!videoInfo) return;
    const a = document.createElement("a");
    a.href = `/api/video/serve/${videoInfo.id}`;
    a.download = "walkthrough.mp4";
    a.click();
  }, [videoInfo]);

  const handleDownloadScript = useCallback(async () => {
    try {
      const res = await fetch(`/api/voiceover-scripts?runId=${state.runId}`);
      if (!res.ok) return;
      const scripts: Record<string, string[]> = await res.json();
      const text = Object.entries(scripts)
        .map(([flowId, paragraphs]) => `# ${flowId}\n\n${paragraphs.join("\n\n")}`)
        .join("\n\n---\n\n");
      const blob = new Blob([text], { type: "text/plain" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "voiceover-script.txt";
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      // ignore download errors
    }
  }, [state.runId]);

  if (loading) return <Phase7OutputSkeleton />;
  // Data may not exist yet while audio/video generation is still running
  if (!chapterMarkers && !videoInfo) return <Phase7OutputSkeleton />;
  if (error || !chapterMarkers) {
    return (
      <ErrorState
        message={error || "No chapter data"}
        onRetry={() => {
          rf1();
          rf2();
        }}
      />
    );
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const videoSrc = videoInfo ? `/api/video/serve/${videoInfo.id}` : null;

  return (
    <div className="h-full flex flex-col animate-slide-in-right">
      <PhaseGoalBanner phase={7} />
      <div className="px-4 py-3 border-b border-border text-xs font-medium flex items-center gap-2 text-muted-foreground bg-card">
        <span className="text-success">▶</span>
        FINAL OUTPUT
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Video player */}
        <VideoPlayerShell ref={containerRef} onKeyDown={handleKeyDown}>
          {/* Video area */}
          <div className="relative aspect-video bg-black flex items-center justify-center">
            {videoSrc && !videoError ? (
              <>
                {/* biome-ignore lint/a11y/useMediaCaption: walkthrough video has no captions yet */}
                <video
                  ref={videoRef}
                  src={videoSrc}
                  className="w-full h-full"
                  onTimeUpdate={handleTimeUpdate}
                  onLoadedMetadata={handleTimeUpdate}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  onEnded={() => setIsPlaying(false)}
                  onError={() => setVideoError(true)}
                  playsInline
                />
                {/* Play overlay (only when paused) */}
                {!isPlaying && (
                  <button
                    type="button"
                    onClick={handlePlay}
                    className="absolute inset-0 flex items-center justify-center group"
                  >
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
                  </button>
                )}
              </>
            ) : (
              <div className="text-center text-muted-foreground">
                <div className="text-sm">{videoError ? "Video could not be loaded" : "No video available yet"}</div>
                <div className="text-2xs mt-1">Run the full pipeline to generate the walkthrough video</div>
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
            {/* biome-ignore lint/a11y/useKeyWithClickEvents: progress bar click-to-seek is mouse-only supplemental control */}
            {/* biome-ignore lint/a11y/noStaticElementInteractions: supplemental seek control alongside play button */}
            <div
              className="flex-1 relative h-[3px] bg-muted cursor-pointer"
              style={{ borderRadius: "99px" }}
              onClick={handleSeek}
            >
              <div
                className="absolute inset-y-0 left-0 bg-primary"
                style={{
                  width: `${progress}%`,
                  borderRadius: "99px",
                }}
              />
            </div>
            <span className="text-2xs text-muted-foreground">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
            <Tooltip label="Mute toggle (M)" position="top">
              <button
                type="button"
                onClick={handleMuteToggle}
                className="text-xs w-[24px] h-[24px] flex items-center justify-center text-muted-foreground/70"
              >
                🔊
              </button>
            </Tooltip>
            <Tooltip label="Fullscreen (F)" position="top">
              <button
                type="button"
                onClick={handleFullscreen}
                className="text-xs w-[24px] h-[24px] flex items-center justify-center text-muted-foreground/70"
              >
                ⛶
              </button>
            </Tooltip>
          </div>
        </VideoPlayerShell>

        {/* Chapter markers */}
        <div>
          <div className="text-2xs mb-2 text-muted-foreground">CHAPTERS</div>
          <div className="space-y-1.5">
            {chapterMarkers.map((chapter, i) => (
              <button
                type="button"
                // biome-ignore lint/suspicious/noArrayIndexKey: chapter markers have no stable key
                key={i}
                onClick={() => jumpToChapter(i)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-all rounded-md ${activeChapter === i ? "bg-primary/10 border border-primary" : "bg-card border border-border hover:bg-muted"}`}
              >
                <span className="text-2xs w-[36px] shrink-0 text-primary">{chapter.startTime}</span>
                <span className="text-xs text-foreground">{chapter.flowName}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2">
          <Tooltip label="Download as MP4 video" position="top">
            <button
              type="button"
              onClick={handleDownloadVideo}
              className="flex items-center gap-2 px-3 py-2.5 text-2xs font-medium transition-opacity bg-primary text-primary-foreground rounded-md hover:opacity-90"
            >
              <span>↓</span>
              Download Video
            </button>
          </Tooltip>
          {[
            { label: "Download Audio", icon: "♪", tip: "Download voiceover audio (MP3)", action: handleDownloadAudio },
            { label: "Download Script", icon: "⊞", tip: "Download narration script", action: handleDownloadScript },
            {
              label: "Re-record",
              icon: "↻",
              tip: "Re-record all flows",
              action: () => controller.handleGoBackToPhase(5),
            },
            {
              label: "Edit Voiceover",
              icon: "✎",
              tip: "Go back to voiceover editor",
              action: () => controller.handleGoBackToPhase(6),
            },
          ].map((action) => (
            <Tooltip key={action.label} label={action.tip} position="top">
              <button
                type="button"
                onClick={action.action}
                className="flex items-center gap-2 px-3 py-2.5 text-2xs font-medium transition-colors bg-card border border-border rounded-md text-muted-foreground hover:border-primary hover:text-primary"
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

const VideoPlayerShell = React.forwardRef<
  HTMLDivElement,
  { onKeyDown: (e: React.KeyboardEvent) => void; children: React.ReactNode }
>(({ onKeyDown, children }, ref) =>
  React.createElement(
    "div",
    {
      ref,
      tabIndex: 0,
      role: "application",
      className: "bg-background border border-border rounded-lg overflow-hidden",
      onKeyDown,
    },
    children,
  ),
);
VideoPlayerShell.displayName = "VideoPlayerShell";

function formatTime(seconds: number): string {
  const s = Math.floor(seconds);
  const min = Math.floor(s / 60);
  const sec = s % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

function parseTimeToSeconds(time: string): number {
  const parts = time.split(":").map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}
