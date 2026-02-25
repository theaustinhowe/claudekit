"use client";

import { AlertCircle, Check, Minimize2, WandSparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../utils";
import { Button } from "./button";
import { Textarea } from "./textarea";

export function JsonEditor({
  value,
  onChange,
  className,
  placeholder = "Paste or type JSON...",
  readOnly = false,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  readOnly?: boolean;
}) {
  const [text, setText] = useState(() => {
    if (!value) return "";
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  });

  const lastExternalValue = useRef(value);

  useEffect(() => {
    if (value !== lastExternalValue.current) {
      lastExternalValue.current = value;
      if (!value) {
        setText("");
      } else {
        try {
          setText(JSON.stringify(JSON.parse(value), null, 2));
        } catch {
          setText(value);
        }
      }
    }
  }, [value]);

  const validation = (() => {
    if (text === "") return { valid: true, error: null } as const;
    try {
      JSON.parse(text);
      return { valid: true, error: null } as const;
    } catch (e) {
      return { valid: false, error: (e as SyntaxError).message } as const;
    }
  })();

  const handleFormat = () => {
    if (!validation.valid) return;
    try {
      const formatted = JSON.stringify(JSON.parse(text), null, 2);
      setText(formatted);
      lastExternalValue.current = formatted;
      onChange(formatted);
    } catch {
      // noop
    }
  };

  const handleMinify = () => {
    if (!validation.valid) return;
    try {
      const minified = JSON.stringify(JSON.parse(text));
      setText(minified);
      lastExternalValue.current = minified;
      onChange(minified);
    } catch {
      // noop
    }
  };

  return (
    <div className={cn("flex flex-col", className)}>
      {!readOnly && (
        <div className="flex justify-end mb-1 gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleFormat}
            disabled={!validation.valid || text === ""}
            className="h-7 px-2 text-xs gap-1"
          >
            <WandSparkles className="h-3 w-3" />
            Format
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleMinify}
            disabled={!validation.valid || text === ""}
            className="h-7 px-2 text-xs gap-1"
          >
            <Minimize2 className="h-3 w-3" />
            Minify
          </Button>
        </div>
      )}
      <Textarea
        value={text}
        onChange={(e) => {
          const next = e.target.value;
          setText(next);
          lastExternalValue.current = next;
          onChange(next);
        }}
        className="font-mono text-xs min-h-[200px] flex-1"
        placeholder={placeholder}
        readOnly={readOnly}
      />
      <div
        className={cn(
          "rounded-md px-2 py-1 text-xs flex items-start gap-1.5 mt-1 min-w-0",
          text === ""
            ? "invisible"
            : validation.valid
              ? "bg-green-500/10 text-green-700 dark:text-green-400"
              : "bg-destructive/10 text-destructive",
        )}
      >
        {validation.valid ? <Check className="h-3 w-3 shrink-0" /> : <AlertCircle className="h-3 w-3 shrink-0" />}
        {validation.valid ? "Valid JSON" : validation.error}
      </div>
    </div>
  );
}
