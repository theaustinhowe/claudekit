"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { SyntaxHighlighter } from "@/components/code/syntax-highlighter";

interface MarkdownRendererProps {
  content: string;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || "");
            const isInline = !match && !className;

            if (isInline) {
              return (
                <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono" {...props}>
                  {children}
                </code>
              );
            }

            const language = match ? match[1] : "text";
            const codeString = String(children).replace(/\n$/, "");

            return (
              <div className="not-prose my-4 rounded-lg border overflow-hidden bg-muted/30">
                <SyntaxHighlighter code={codeString} language={language} showLineNumbers={false} />
              </div>
            );
          },
          table({ children }) {
            return (
              <div className="overflow-x-auto my-4">
                <table className="w-full text-sm border-collapse">{children}</table>
              </div>
            );
          },
          th({ children }) {
            return <th className="border px-3 py-2 text-left bg-muted/50 font-medium">{children}</th>;
          },
          td({ children }) {
            return <td className="border px-3 py-2">{children}</td>;
          },
          a({ href, children }) {
            return (
              <a href={href} className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
