"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "../utils";

interface SplitPanelProps {
  left: React.ReactNode;
  right: React.ReactNode;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  mobileLabels?: [string, string];
}

export function SplitPanel({
  left,
  right,
  defaultWidth = 60,
  minWidth = 35,
  maxWidth = 75,
  mobileLabels = ["Chat", "Panel"],
}: SplitPanelProps) {
  const [leftWidth, setLeftWidth] = useState(defaultWidth);
  const [activeTab, setActiveTab] = useState<"left" | "right">("left");
  const [isMobile, setIsMobile] = useState(false);
  const isDragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const handleMouseDown = useCallback(() => {
    isDragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setLeftWidth(Math.min(Math.max(pct, minWidth), maxWidth));
    };

    const handleMouseUp = () => {
      isDragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [minWidth, maxWidth]);

  if (isMobile) {
    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        <div className="flex shrink-0 bg-card border-b border-border">
          <button
            type="button"
            onClick={() => setActiveTab("left")}
            className={cn(
              "flex-1 py-2.5 text-xs font-medium text-center transition-colors border-b-2",
              activeTab === "left"
                ? "text-primary border-primary bg-accent"
                : "text-muted-foreground border-transparent",
            )}
          >
            {mobileLabels[0]}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("right")}
            className={cn(
              "flex-1 py-2.5 text-xs font-medium text-center transition-colors border-b-2",
              activeTab === "right"
                ? "text-primary border-primary bg-accent"
                : "text-muted-foreground border-transparent",
            )}
          >
            {mobileLabels[1]}
          </button>
        </div>
        <div className="flex-1 overflow-hidden">
          <div className={activeTab === "left" ? "h-full" : "hidden"}>{left}</div>
          <div className={activeTab === "right" ? "h-full" : "hidden"}>{right}</div>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex flex-1 overflow-hidden">
      <div className="overflow-hidden min-h-0 flex flex-col" style={{ width: `${leftWidth}%` }}>
        {left}
      </div>

      {/* Drag handle */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: drag handle doesn't need keyboard interaction */}
      <div className="w-[1px] relative cursor-col-resize group shrink-0 bg-border" onMouseDown={handleMouseDown}>
        <div className="absolute inset-y-0 -left-[3px] w-[7px] group-hover:bg-primary/15 transition-colors" />
      </div>

      <div className="overflow-hidden min-h-0 flex flex-col" style={{ width: `${100 - leftWidth}%` }}>
        {right}
      </div>
    </div>
  );
}
