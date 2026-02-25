"use client";

import { useState } from "react";
import { Textarea } from "./textarea";

export function JsonEditor({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const [text, setText] = useState(() => {
    if (!value) return "";
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  });

  const isValid = (() => {
    if (text === "") return true;
    try {
      JSON.parse(text);
      return true;
    } catch {
      return false;
    }
  })();

  return (
    <div className={className}>
      <Textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(e.target.value);
        }}
        className="font-mono text-xs min-h-[120px]"
      />
      {text !== "" && (
        <span className={`text-[10px] ${isValid ? "text-green-600 dark:text-green-400" : "text-destructive"}`}>
          {isValid ? "Valid JSON" : "Invalid JSON"}
        </span>
      )}
    </div>
  );
}
