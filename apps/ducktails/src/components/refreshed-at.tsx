"use client";

import { useEffect, useState } from "react";

function formatRelativeTime(timestamp: number): string {
  const seconds = Math.round((Date.now() - timestamp) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return new Date(timestamp).toLocaleTimeString();
}

export function RefreshedAt({ timestamp }: { timestamp: number }) {
  const [, setTick] = useState(0);

  // Re-render every 5 seconds to keep the relative time current
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 5_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <span className="text-xs text-muted-foreground whitespace-nowrap">Updated {formatRelativeTime(timestamp)}</span>
  );
}
