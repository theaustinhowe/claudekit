"use client";

import { cn } from "@claudekit/ui";
import { Button } from "@claudekit/ui/components/button";
import { Input } from "@claudekit/ui/components/input";
import { Label } from "@claudekit/ui/components/label";
import { ChevronRight, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";

const HOOK_EVENTS = ["PreToolUse", "PostToolUse", "Stop", "Notification", "SubagentStop"] as const;
type HookEvent = (typeof HOOK_EVENTS)[number];

interface HookEntry {
  type: "command";
  command: string;
}

interface MatcherGroup {
  matcher?: string;
  hooks: HookEntry[];
}

type HooksValue = Record<string, MatcherGroup[]>;

interface HooksEditorProps {
  value: HooksValue;
  onChange: (value: HooksValue) => void;
}

export function HooksEditor({ value, onChange }: HooksEditorProps) {
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(() => {
    const expanded = new Set<string>();
    for (const event of HOOK_EVENTS) {
      if (value[event] && value[event].length > 0) {
        expanded.add(event);
      }
    }
    return expanded;
  });

  const toggleEvent = (event: string) => {
    setExpandedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(event)) {
        next.delete(event);
      } else {
        next.add(event);
      }
      return next;
    });
  };

  const addMatcherGroup = (event: HookEvent) => {
    const current = value[event] ?? [];
    const updated = [...current, { matcher: "", hooks: [{ type: "command" as const, command: "" }] }];
    onChange({ ...value, [event]: updated });
    setExpandedEvents((prev) => new Set([...prev, event]));
  };

  const removeMatcherGroup = (event: HookEvent, index: number) => {
    const current = value[event] ?? [];
    const updated = current.filter((_, i) => i !== index);
    onChange({ ...value, [event]: updated.length > 0 ? updated : undefined } as HooksValue);
  };

  const updateMatcher = (event: HookEvent, index: number, matcher: string) => {
    const current = [...(value[event] ?? [])];
    current[index] = { ...current[index], matcher: matcher || undefined };
    onChange({ ...value, [event]: current });
  };

  const addHookEntry = (event: HookEvent, groupIndex: number) => {
    const current = [...(value[event] ?? [])];
    current[groupIndex] = {
      ...current[groupIndex],
      hooks: [...current[groupIndex].hooks, { type: "command", command: "" }],
    };
    onChange({ ...value, [event]: current });
  };

  const removeHookEntry = (event: HookEvent, groupIndex: number, hookIndex: number) => {
    const current = [...(value[event] ?? [])];
    const hooks = current[groupIndex].hooks.filter((_, i) => i !== hookIndex);
    if (hooks.length === 0) {
      removeMatcherGroup(event, groupIndex);
    } else {
      current[groupIndex] = { ...current[groupIndex], hooks };
      onChange({ ...value, [event]: current });
    }
  };

  const updateHookCommand = (event: HookEvent, groupIndex: number, hookIndex: number, command: string) => {
    const current = [...(value[event] ?? [])];
    const hooks = [...current[groupIndex].hooks];
    hooks[hookIndex] = { ...hooks[hookIndex], command };
    current[groupIndex] = { ...current[groupIndex], hooks };
    onChange({ ...value, [event]: current });
  };

  return (
    <div className="space-y-2">
      {HOOK_EVENTS.map((event) => {
        const groups = value[event] ?? [];
        const isExpanded = expandedEvents.has(event);
        const count = groups.length;

        return (
          <div key={event} className="rounded-lg border overflow-hidden">
            <button
              type="button"
              onClick={() => toggleEvent(event)}
              className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-muted/50 transition-colors"
            >
              <ChevronRight
                className={cn(
                  "w-3.5 h-3.5 text-muted-foreground transition-transform duration-200",
                  isExpanded && "rotate-90",
                )}
              />
              <span className="text-sm font-medium flex-1">{event}</span>
              {count > 0 && (
                <span className="text-xs text-primary">
                  {count} matcher{count > 1 ? "s" : ""}
                </span>
              )}
            </button>

            {isExpanded && (
              <div className="border-t px-3 py-2 space-y-3">
                {groups.map((group, gi) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: matcher groups have no stable ID
                  <div key={gi} className="rounded border p-3 space-y-2 bg-muted/20">
                    <div className="flex items-center gap-2">
                      <Label className="text-xs shrink-0">Matcher</Label>
                      <Input
                        value={group.matcher ?? ""}
                        onChange={(e) => updateMatcher(event, gi, e.target.value)}
                        placeholder="* (all tools)"
                        className="h-7 text-xs flex-1"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-destructive"
                        onClick={() => removeMatcherGroup(event, gi)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>

                    {group.hooks.map((hook, hi) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: hook entries have no stable ID
                      <div key={hi} className="flex items-center gap-2 pl-4">
                        <span className="text-xs text-muted-foreground shrink-0">$</span>
                        <Input
                          value={hook.command}
                          onChange={(e) => updateHookCommand(event, gi, hi, e.target.value)}
                          placeholder="shell command"
                          className="h-7 text-xs font-mono flex-1"
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => removeHookEntry(event, gi, hi)}
                        >
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ))}

                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs pl-4"
                      onClick={() => addHookEntry(event, gi)}
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Add command
                    </Button>
                  </div>
                ))}

                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => addMatcherGroup(event)}>
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Add matcher
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
