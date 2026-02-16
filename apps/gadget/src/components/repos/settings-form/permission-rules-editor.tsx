"use client";

import { Plus, X } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@devkit/ui/components/button";
import { Input } from "@devkit/ui/components/input";
import { Popover, PopoverContent, PopoverTrigger } from "@devkit/ui/components/popover";
import { PERMISSION_SUGGESTIONS } from "@/lib/constants/permission-suggestions";

interface PermissionRulesEditorProps {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  fieldPath?: string;
}

export function PermissionRulesEditor({ value, onChange, placeholder, fieldPath }: PermissionRulesEditorProps) {
  const [input, setInput] = useState("");
  const [popoverOpen, setPopoverOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestions = fieldPath ? (PERMISSION_SUGGESTIONS[fieldPath] ?? []) : [];
  const unusedSuggestions = suggestions.filter((s) => !value.includes(s));

  const filteredSuggestions = input.trim()
    ? unusedSuggestions.filter((s) => s.toLowerCase().includes(input.toLowerCase()))
    : unusedSuggestions;

  const addRule = (rule?: string) => {
    const trimmed = (rule ?? input).trim();
    if (!trimmed || value.includes(trimmed)) return;
    onChange([...value, trimmed]);
    setInput("");
    setPopoverOpen(false);
  };

  const removeRule = (rule: string) => {
    onChange(value.filter((r) => r !== rule));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addRule();
    }
  };

  const handleInputChange = (val: string) => {
    setInput(val);
    if (val.trim() && filteredSuggestions.length > 0) {
      setPopoverOpen(true);
    } else {
      setPopoverOpen(false);
    }
  };

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="space-y-1">
          {[...value]
            .sort((a, b) => a.localeCompare(b))
            .map((rule) => (
              <div key={rule} className="flex items-center justify-between px-2 py-1.5 rounded-md bg-muted/50 border">
                <code className="text-xs font-mono">{rule}</code>
                <button
                  type="button"
                  onClick={() => removeRule(rule)}
                  className="ml-2 rounded-full p-0.5 hover:bg-muted-foreground/20 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
        </div>
      )}
      <div className="flex gap-2">
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger asChild>
            <div className="flex-1">
              <Input
                ref={inputRef}
                value={input}
                onChange={(e) => handleInputChange(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => {
                  if (input.trim() && filteredSuggestions.length > 0) setPopoverOpen(true);
                }}
                placeholder={placeholder ?? "Add rule..."}
                className="h-8 text-sm font-mono"
              />
            </div>
          </PopoverTrigger>
          {filteredSuggestions.length > 0 && (
            <PopoverContent
              className="p-1 w-[var(--radix-popover-trigger-width)]"
              align="start"
              sideOffset={4}
              onOpenAutoFocus={(e) => e.preventDefault()}
            >
              <div className="max-h-48 overflow-y-auto">
                {filteredSuggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    className="w-full text-left px-2 py-1.5 text-sm font-mono rounded hover:bg-muted transition-colors"
                    onClick={() => addRule(suggestion)}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </PopoverContent>
          )}
        </Popover>
        <Button type="button" variant="outline" size="sm" onClick={() => addRule()} disabled={!input.trim()}>
          <Plus className="w-3.5 h-3.5" />
        </Button>
      </div>
      {/* Quick-add suggestion chips */}
      {unusedSuggestions.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {unusedSuggestions.slice(0, 8).map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => addRule(suggestion)}
              className="inline-flex items-center px-2 py-0.5 text-[11px] font-mono border border-dashed rounded-md text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
            >
              + {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
