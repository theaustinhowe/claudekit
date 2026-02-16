"use client";

import { ChevronRight } from "lucide-react";

interface CodeBreadcrumbProps {
  repoName: string;
  currentPath: string;
  onNavigate: (path: string) => void;
}

export function CodeBreadcrumb({ repoName, currentPath, onNavigate }: CodeBreadcrumbProps) {
  const segments = currentPath ? currentPath.split("/") : [];

  return (
    <nav className="flex items-center gap-1 text-sm min-w-0 overflow-x-auto">
      <button
        type="button"
        onClick={() => onNavigate("")}
        className="font-semibold text-foreground hover:text-primary transition-colors shrink-0"
      >
        {repoName}
      </button>
      {segments.map((segment, idx) => {
        const segmentPath = segments.slice(0, idx + 1).join("/");
        const isLast = idx === segments.length - 1;

        return (
          <span key={segmentPath} className="flex items-center gap-1 shrink-0">
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
            {isLast ? (
              <span className="font-medium text-foreground">{segment}</span>
            ) : (
              <button
                type="button"
                onClick={() => onNavigate(segmentPath)}
                className="text-primary hover:underline transition-colors"
              >
                {segment}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}
