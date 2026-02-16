"use client";

import { Button } from "@devkit/ui/components/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@devkit/ui/components/tooltip";
import { Film, Maximize2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { ProjectScreenshot } from "@/lib/types";
import { cn } from "@devkit/ui";

interface ScreenshotTimelapseProps {
  projectId: string;
}

export function ScreenshotTimelapse({ projectId }: ScreenshotTimelapseProps) {
  const [screenshots, setScreenshots] = useState<ProjectScreenshot[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchScreenshots = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/screenshots`);
      if (res.ok) {
        const data = await res.json();
        setScreenshots(data.screenshots || []);
      }
    } catch {
      // Ignore fetch errors
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchScreenshots();
  }, [fetchScreenshots]);

  // Auto-select the latest screenshot once loaded
  useEffect(() => {
    if (screenshots.length > 0 && !selectedId) {
      setSelectedId(screenshots[screenshots.length - 1].id);
    }
  }, [screenshots, selectedId]);

  // Close fullscreen on Escape
  useEffect(() => {
    if (!fullscreen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [fullscreen]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <div className="text-center">
          <Film className="w-8 h-8 mx-auto mb-2 animate-pulse" />
          <p className="text-xs">Loading screenshots...</p>
        </div>
      </div>
    );
  }

  if (screenshots.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <div className="text-center">
          <Film className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm font-medium">No screenshots yet</p>
          <p className="text-xs mt-1">Screenshots are captured after scaffolding and design changes</p>
        </div>
      </div>
    );
  }

  // Newest first
  const sorted = [...screenshots].reverse();
  const selected = selectedId ? screenshots.find((s) => s.id === selectedId) : null;

  return (
    <>
      <div className="h-full flex flex-col overflow-hidden">
        {/* Filmstrip — horizontal, newest first */}
        <div className="border-b shrink-0">
          <TooltipProvider>
            <div className="flex gap-2 p-3 overflow-x-auto scrollbar-none">
              {sorted.map((screenshot) => (
                <Tooltip key={screenshot.id}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => setSelectedId(screenshot.id === selectedId ? null : screenshot.id)}
                      className={cn(
                        "shrink-0 rounded-md overflow-hidden border-2 transition-all hover:border-primary/50",
                        screenshot.id === selectedId ? "border-primary ring-2 ring-primary/20" : "border-transparent",
                      )}
                    >
                      {/* biome-ignore lint/performance/noImgElement: dynamic API-served screenshots */}
                      <img
                        src={`/api/projects/${projectId}/screenshots/${screenshot.id}`}
                        alt={screenshot.label || "Screenshot"}
                        className="w-28 h-[70px] object-cover"
                      />
                      <div className="px-1.5 py-0.5 bg-background/80">
                        <p className="text-[10px] text-muted-foreground truncate max-w-28">
                          {screenshot.label || new Date(screenshot.created_at).toLocaleTimeString()}
                        </p>
                      </div>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{new Date(screenshot.created_at).toLocaleString()}</TooltipContent>
                </Tooltip>
              ))}
            </div>
          </TooltipProvider>
        </div>

        {/* Selected preview */}
        <div className="flex-1 overflow-auto">
          {selected ? (
            <div className="relative flex items-center justify-center p-4 min-h-full bg-muted/30">
              <div className="absolute top-2 right-2 flex items-center gap-1 z-10">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setFullscreen(true)}>
                        <Maximize2 className="w-4 h-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Fullscreen</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSelectedId(null)}>
                        <X className="w-4 h-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Close</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              {/* biome-ignore lint/performance/noImgElement: dynamic API-served screenshots */}
              {/* biome-ignore lint/a11y/useKeyWithClickEvents: fullscreen button available */}
              <img
                src={`/api/projects/${projectId}/screenshots/${selected.id}`}
                alt={selected.label || "Screenshot"}
                className="max-w-full max-h-full object-contain rounded-md shadow-lg cursor-pointer"
                onClick={() => setFullscreen(true)}
              />
              {selected.label && (
                <div className="absolute bottom-4 left-4 text-xs bg-background/80 backdrop-blur-sm px-2 py-1 rounded">
                  {selected.label}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <p className="text-xs">Select a screenshot to preview</p>
            </div>
          )}
        </div>
      </div>

      {/* Fullscreen overlay */}
      {fullscreen && selected && (
        // biome-ignore lint/a11y/useKeyWithClickEvents: Escape key handled via useEffect
        // biome-ignore lint/a11y/noStaticElementInteractions: backdrop click to close
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center cursor-pointer"
          onClick={() => setFullscreen(false)}
        >
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-4 right-4 h-9 w-9 text-white hover:text-white hover:bg-white/10 z-10"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFullscreen(false);
                  }}
                >
                  <X className="w-5 h-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Close</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {/* biome-ignore lint/performance/noImgElement: dynamic API-served screenshots */}
          {/* biome-ignore lint/a11y/useKeyWithClickEvents: click stops propagation only */}
          <img
            src={`/api/projects/${projectId}/screenshots/${selected.id}`}
            alt={selected.label || "Screenshot"}
            className="max-w-[95vw] max-h-[95vh] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          {selected.label && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-sm text-white/80 bg-black/50 backdrop-blur-sm px-3 py-1.5 rounded">
              {selected.label}
            </div>
          )}
        </div>
      )}
    </>
  );
}
