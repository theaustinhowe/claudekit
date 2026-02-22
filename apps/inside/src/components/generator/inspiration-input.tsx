"use client";

import { Badge } from "@claudekit/ui/components/badge";
import { Button } from "@claudekit/ui/components/button";
import { Input } from "@claudekit/ui/components/input";
import { Plus, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface InspirationInputProps {
  urls: string[];
  onChange: (urls: string[]) => void;
}

export function InspirationInput({ urls, onChange }: InspirationInputProps) {
  const [inputValue, setInputValue] = useState("");

  const addUrl = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;

    if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
      toast.error("URL must start with http:// or https://");
      return;
    }

    if (urls.includes(trimmed)) {
      toast.info("URL already added");
      return;
    }

    if (urls.length >= 5) {
      toast.info("Maximum 5 inspiration URLs allowed");
      return;
    }

    onChange([...urls, trimmed]);
    setInputValue("");
  };

  const removeUrl = (url: string) => {
    onChange(urls.filter((u) => u !== url));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addUrl();
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          placeholder="https://example.com"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <Button type="button" variant="outline" size="sm" onClick={addUrl} className="shrink-0">
          <Plus className="h-4 w-4 mr-1" />
          Add
        </Button>
      </div>
      {urls.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {urls.map((url) => (
            <Badge key={url} variant="secondary" className="gap-1 pr-1">
              <span className="max-w-[200px] truncate">{url}</span>
              <button
                type="button"
                onClick={() => removeUrl(url)}
                className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
