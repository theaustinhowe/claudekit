"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@devkit/ui/components/button";
import { Input } from "@devkit/ui/components/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@devkit/ui/components/tooltip";

interface KeyValueEditorProps {
  value: Record<string, string>;
  onChange: (value: Record<string, string>) => void;
}

export function KeyValueEditor({ value, onChange }: KeyValueEditorProps) {
  const entries = Object.entries(value);

  const updateKey = (oldKey: string, newKey: string) => {
    const result: Record<string, string> = {};
    for (const [k, v] of entries) {
      result[k === oldKey ? newKey : k] = v;
    }
    onChange(result);
  };

  const updateValue = (key: string, newValue: string) => {
    onChange({ ...value, [key]: newValue });
  };

  const removeEntry = (key: string) => {
    const result = { ...value };
    delete result[key];
    onChange(result);
  };

  const addEntry = () => {
    // Find a unique key name
    let name = "NEW_VAR";
    let i = 1;
    while (name in value) {
      name = `NEW_VAR_${i++}`;
    }
    onChange({ ...value, [name]: "" });
  };

  return (
    <div className="space-y-2">
      {entries.length > 0 && (
        <div className="flex gap-2 items-center px-0.5">
          <span className="flex-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Name</span>
          <span className="flex-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Value</span>
          <span className="w-8" />
        </div>
      )}
      {entries.map(([key, val]) => (
        <div key={key} className="flex gap-2 items-center">
          <Input
            value={key}
            onChange={(e) => updateKey(key, e.target.value)}
            placeholder="KEY"
            className="h-8 text-sm font-mono flex-1"
          />
          <Input
            value={val}
            onChange={(e) => updateValue(key, e.target.value)}
            placeholder="value"
            className="h-8 text-sm font-mono flex-1"
          />
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeEntry(key)}
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Remove</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={addEntry}>
        <Plus className="w-3.5 h-3.5 mr-1.5" />
        Add Variable
      </Button>
    </div>
  );
}
