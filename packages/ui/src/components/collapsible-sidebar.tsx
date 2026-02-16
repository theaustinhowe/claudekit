"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { cn } from "../utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip";

interface CollapsibleSidebarContext {
  collapsed: boolean;
  toggle: () => void;
}

interface CollapsibleSidebarProps {
  expandedWidth?: number;
  collapsedWidth?: number;
  storageKey?: string;
  defaultCollapsed?: boolean;
  className?: string;
  toggleClassName?: string;
  toggleTooltip?: boolean;
  children: (ctx: CollapsibleSidebarContext) => React.ReactNode;
}

export function CollapsibleSidebar({
  expandedWidth = 240,
  collapsedWidth = 64,
  storageKey,
  defaultCollapsed = false,
  className,
  toggleClassName,
  toggleTooltip = false,
  children,
}: CollapsibleSidebarProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [hovered, setHovered] = useState(false);

  // Restore collapsed state from localStorage
  useEffect(() => {
    if (!storageKey) return;
    const stored = localStorage.getItem(storageKey);
    if (stored === "true") setCollapsed(true);
    else if (stored === "false") setCollapsed(false);
  }, [storageKey]);

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      if (storageKey) localStorage.setItem(storageKey, String(next));
      return next;
    });
  }, [storageKey]);

  const toggleButton = (
    <motion.button
      type="button"
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={{ duration: 0.15 }}
      onClick={toggle}
      className={cn(
        "absolute -right-3 top-1/2 -translate-y-1/2 z-50 w-6 h-6 rounded-full border shadow-sm flex items-center justify-center transition-colors",
        toggleClassName || "bg-accent text-accent-foreground hover:bg-accent/80",
      )}
    >
      {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
    </motion.button>
  );

  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? collapsedWidth : expandedWidth }}
      transition={{ duration: 0.2, ease: "easeInOut" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn("bg-sidebar border-r border-sidebar-border flex flex-col relative z-40 hidden md:flex", className)}
    >
      {/* Collapse toggle — floating pill on right edge */}
      <AnimatePresence>
        {hovered &&
          (toggleTooltip ? (
            <TooltipProvider key="toggle">
              <Tooltip>
                <TooltipTrigger asChild>{toggleButton}</TooltipTrigger>
                <TooltipContent side="right">{collapsed ? "Expand sidebar" : "Collapse sidebar"}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            toggleButton
          ))}
      </AnimatePresence>

      {children({ collapsed, toggle })}
    </motion.aside>
  );
}

/* ---------- SidebarLogo ---------- */

interface SidebarLogoProps {
  collapsed: boolean;
  icon: React.ReactNode;
  wordmark: React.ReactNode;
}

export function SidebarLogo({ collapsed, icon, wordmark }: SidebarLogoProps) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      {collapsed ? (
        <motion.div
          key="icon"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {icon}
        </motion.div>
      ) : (
        <motion.div
          key="wordmark"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {wordmark}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
