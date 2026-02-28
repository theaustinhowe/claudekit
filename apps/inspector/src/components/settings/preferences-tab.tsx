"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@claudekit/ui/components/card";
import { Checkbox } from "@claudekit/ui/components/checkbox";
import { Slider } from "@claudekit/ui/components/slider";
import { Switch } from "@claudekit/ui/components/switch";
import { useState } from "react";
import { setSetting } from "@/lib/actions/settings";
import { FEEDBACK_CATEGORIES } from "@/lib/constants";

interface PreferencesTabProps {
  settings: Record<string, string>;
}

export function PreferencesTab({ settings }: PreferencesTabProps) {
  const [minSize, setMinSize] = useState(Number(settings.min_split_size) || 400);
  const [ignoreBots, setIgnoreBots] = useState(settings.ignore_bots !== "false");
  const [temp, setTemp] = useState(Number(settings.temperature) || 0.7);
  const [selectedCats, setSelectedCats] = useState(() => {
    if (settings.feedback_categories) {
      try {
        return new Set<string>(JSON.parse(settings.feedback_categories));
      } catch {
        return new Set(FEEDBACK_CATEGORIES);
      }
    }
    return new Set(FEEDBACK_CATEGORIES);
  });

  const toggleCat = (cat: string) => {
    setSelectedCats((prev) => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      setSetting("feedback_categories", JSON.stringify([...next]));
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Analysis Preferences</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            {/* biome-ignore lint/a11y/noLabelWithoutControl: label wraps input component */}
            <label className="text-sm font-medium mb-2 block">Minimum PR size for split suggestions</label>
            <div className="flex items-center gap-3">
              <Slider
                value={[minSize]}
                onValueChange={(v) => {
                  setMinSize(v[0]);
                  setSetting("min_split_size", String(v[0]));
                }}
                min={100}
                max={1000}
                step={50}
                className="flex-1"
              />
              <span className="font-mono text-sm w-16 text-right">{minSize}L</span>
            </div>
          </div>
          <div>
            {/* biome-ignore lint/a11y/noLabelWithoutControl: label wraps input component */}
            <label className="text-sm font-medium mb-2 block">Feedback categories to track</label>
            <div className="grid grid-cols-2 gap-2">
              {FEEDBACK_CATEGORIES.map((cat) => (
                // biome-ignore lint/a11y/noLabelWithoutControl: label wraps input component
                <label key={cat} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={selectedCats.has(cat)} onCheckedChange={() => toggleCat(cat)} />
                  {cat}
                </label>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div>
              {/* biome-ignore lint/a11y/noLabelWithoutControl: label wraps input component */}
              <label className="text-sm font-medium">Ignore bot comments</label>
              <p className="text-xs text-muted-foreground">Filter out automated review comments</p>
            </div>
            <Switch
              checked={ignoreBots}
              onCheckedChange={(v) => {
                setIgnoreBots(v);
                setSetting("ignore_bots", String(v));
              }}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">LLM Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            {/* biome-ignore lint/a11y/noLabelWithoutControl: label wraps input component */}
            <label className="text-sm font-medium mb-2 block">Temperature</label>
            <div className="flex items-center gap-3">
              <Slider
                value={[temp * 100]}
                onValueChange={(v) => {
                  const newTemp = v[0] / 100;
                  setTemp(newTemp);
                  setSetting("temperature", String(newTemp));
                }}
                min={0}
                max={100}
                step={5}
                className="flex-1"
              />
              <span className="font-mono text-sm w-10 text-right">{temp.toFixed(2)}</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Analysis is powered by Claude via the claude-runner package. Configure the Claude CLI separately.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
