"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface SplitPanelProps {
  left: React.ReactNode;
  right: React.ReactNode;
}

export function SplitPanel({ left, right }: SplitPanelProps) {
  const [leftWidth, setLeftWidth] = useState(60);
  const [activeTab, setActiveTab] = useState<"chat" | "panel">("chat");
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
      setLeftWidth(Math.min(Math.max(pct, 35), 75));
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
  }, []);

  if (isMobile) {
    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Mobile tab bar */}
        <div className="flex shrink-0 bg-card border-b border-border">
          <button
            type="button"
            onClick={() => setActiveTab("chat")}
            className="flex-1 py-2.5 text-xs font-medium text-center transition-colors"
            style={{
              color: activeTab === "chat" ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))",
              borderBottom: activeTab === "chat" ? "2px solid hsl(var(--primary))" : "2px solid transparent",
              background: activeTab === "chat" ? "hsl(var(--accent))" : "transparent",
            }}
          >
            Chat
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("panel")}
            className="flex-1 py-2.5 text-xs font-medium text-center transition-colors"
            style={{
              color: activeTab === "panel" ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))",
              borderBottom: activeTab === "panel" ? "2px solid hsl(var(--primary))" : "2px solid transparent",
              background: activeTab === "panel" ? "hsl(var(--accent))" : "transparent",
            }}
          >
            Panel
          </button>
        </div>

        {/* Mobile content */}
        <div className="flex-1 overflow-hidden">
          <div className={activeTab === "chat" ? "h-full" : "hidden"}>{left}</div>
          <div className={activeTab === "panel" ? "h-full" : "hidden"}>{right}</div>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex flex-1 overflow-hidden">
      <div className="overflow-hidden flex flex-col" style={{ width: `${leftWidth}%` }}>
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
