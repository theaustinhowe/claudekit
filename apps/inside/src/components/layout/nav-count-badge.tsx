"use client";

import { useEffect, useState } from "react";
import { getProjectCounts } from "@/lib/actions/generator-projects";

function CountBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-medium rounded-full bg-muted text-muted-foreground">
      {count}
    </span>
  );
}

export function ActiveCountBadge() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    getProjectCounts().then((c) => setCount(c.active));
  }, []);

  if (count === null || count === 0) return null;
  return <CountBadge count={count} />;
}

export function ArchivedCountBadge() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    getProjectCounts().then((c) => setCount(c.archived));
  }, []);

  if (count === null || count === 0) return null;
  return <CountBadge count={count} />;
}
