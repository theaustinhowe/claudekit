"use client";

import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";

interface SyntaxHighlighterProps {
  code: string;
  language: string;
  showLineNumbers?: boolean;
}

// Module-level cache for the highlighter
let highlighterPromise: Promise<unknown> | null = null;
let cachedHighlighter: {
  codeToHtml: (code: string, opts: { lang: string; theme: string }) => string;
} | null = null;

async function getHighlighter() {
  if (cachedHighlighter) return cachedHighlighter;
  if (!highlighterPromise) {
    highlighterPromise = import("shiki").then(async (shiki) => {
      const h = await shiki.createHighlighter({
        themes: ["github-light", "github-dark-dimmed"],
        langs: [
          "typescript",
          "tsx",
          "javascript",
          "jsx",
          "json",
          "jsonc",
          "markdown",
          "mdx",
          "css",
          "scss",
          "html",
          "xml",
          "yaml",
          "toml",
          "python",
          "rust",
          "go",
          "bash",
          "sql",
          "graphql",
          "dockerfile",
          "prisma",
          "vue",
          "svelte",
          "ruby",
          "java",
          "kotlin",
          "swift",
          "c",
          "cpp",
          "csharp",
          "php",
        ],
      });
      cachedHighlighter = h;
      return h;
    });
  }
  return highlighterPromise;
}

export function SyntaxHighlighter({ code, language, showLineNumbers = true }: SyntaxHighlighterProps) {
  const { resolvedTheme } = useTheme();
  const [html, setHtml] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    getHighlighter()
      .then((h) => {
        if (cancelled || !h) return;
        const hl = h as typeof cachedHighlighter;
        if (!hl) return;

        const theme = resolvedTheme === "dark" ? "github-dark-dimmed" : "github-light";
        try {
          const result = hl.codeToHtml(code, { lang: language, theme });
          if (!cancelled) setHtml(result);
        } catch {
          // Language not loaded — fall back to plain text
          try {
            const result = hl.codeToHtml(code, { lang: "text", theme });
            if (!cancelled) setHtml(result);
          } catch {
            if (!cancelled) setHtml(null);
          }
        }
      })
      .catch(() => {
        if (!cancelled) setHtml(null);
      });

    return () => {
      cancelled = true;
    };
  }, [code, language, resolvedTheme]);

  if (!html) {
    return (
      <div className="relative">
        <pre className="overflow-auto text-sm font-mono p-4 bg-muted rounded-lg whitespace-pre">
          {showLineNumbers && <LineNumbers count={code.split("\n").length} />}
          <code>{code}</code>
        </pre>
      </div>
    );
  }

  const lineCount = code.split("\n").length;

  return (
    <div ref={containerRef} className="syntax-highlighted overflow-auto text-sm flex">
      {showLineNumbers && (
        <div
          className="shrink-0 sticky left-0 bg-muted/50 text-right select-none text-muted-foreground border-r border-border px-3 py-4 font-mono z-10"
          style={{ minWidth: `${String(lineCount).length + 2}ch` }}
        >
          {Array.from({ length: lineCount }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: line numbers are stable indices
            <div key={i} className="leading-relaxed">
              {i + 1}
            </div>
          ))}
        </div>
      )}
      <div
        className="flex-1 min-w-0 [&_pre]:!bg-transparent [&_pre]:!py-4 [&_pre]:!pl-4 [&_pre]:!pr-4 [&_pre]:!m-0 [&_code]:!bg-transparent [&_code]:!whitespace-pre"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: shiki output is safe
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

function LineNumbers({ count }: { count: number }) {
  return (
    <span
      className="inline-block text-right pr-4 mr-4 border-r border-border text-muted-foreground select-none"
      style={{ minWidth: `${String(count).length + 1}ch` }}
    >
      {Array.from({ length: count }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: line numbers are stable indices
        <span key={i} className="block leading-relaxed">
          {i + 1}
        </span>
      ))}
    </span>
  );
}
