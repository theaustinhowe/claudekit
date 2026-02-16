"use client";

import { useEffect, useRef, useState } from "react";

interface TooltipProps {
  label: string;
  children: React.ReactNode;
  position?: "top" | "bottom" | "left" | "right";
  delay?: number;
}

export function Tooltip({ label, children, position = "top", delay = 400 }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

  const show = () => {
    timeoutRef.current = setTimeout(() => setVisible(true), delay);
  };

  const hide = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setVisible(false);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const positionStyles: Record<string, React.CSSProperties> = {
    top: {
      bottom: "calc(100% + 6px)",
      left: "50%",
      transform: "translateX(-50%)",
    },
    bottom: {
      top: "calc(100% + 6px)",
      left: "50%",
      transform: "translateX(-50%)",
    },
    left: {
      right: "calc(100% + 6px)",
      top: "50%",
      transform: "translateY(-50%)",
    },
    right: {
      left: "calc(100% + 6px)",
      top: "50%",
      transform: "translateY(-50%)",
    },
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: tooltip wrapper delegates focus/hover to trigger child
    <div
      ref={triggerRef}
      className="relative inline-flex"
      role="presentation"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {visible && (
        <div
          className="absolute z-50 whitespace-nowrap pointer-events-none text-foreground rounded-sm border"
          style={{
            ...positionStyles[position],
            background: "hsl(var(--popover))",
            borderColor: "hsl(var(--foreground) / 0.15)",
            padding: "4px 8px",
            fontSize: "11px",
            fontWeight: 500,
            lineHeight: 1.3,
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
            animation: "fadeIn 0.15s ease-out forwards",
          }}
        >
          {label}
        </div>
      )}
    </div>
  );
}
