"use client";

import "@dayflow/blossom-color-picker/styles.css";
import type { BlossomColorPickerColor, BlossomColorPickerValue } from "@dayflow/blossom-color-picker-react";
import { BlossomColorPicker, lightnessToSliderValue, parseColor } from "@dayflow/blossom-color-picker-react";
import { Button } from "@devkit/ui/components/button";
import { Label } from "@devkit/ui/components/label";
import { X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const PRESETS = [
  { name: "Indigo/Amber", primary: "#6366f1", accent: "#f59e0b" },
  { name: "Slate/Emerald", primary: "#64748b", accent: "#10b981" },
  { name: "Rose/Cyan", primary: "#f43f5e", accent: "#06b6d4" },
  { name: "Violet/Orange", primary: "#8b5cf6", accent: "#f97316" },
  { name: "Blue/Yellow", primary: "#3b82f6", accent: "#eab308" },
  { name: "Teal/Pink", primary: "#14b8a6", accent: "#ec4899" },
];

function hexToPickerValue(hex: string): BlossomColorPickerValue {
  const { h, s, l } = parseColor(hex);
  return {
    hue: h,
    saturation: lightnessToSliderValue(l),
    originalSaturation: s,
    lightness: l,
    alpha: 1,
    layer: "outer",
  };
}

/** Renders the BlossomColorPicker and auto-expands it on mount so the
 *  library's native bloom animation plays and click-outside is properly bound. */
function PickerDropdown({
  onChange,
  onDismiss,
  currentHex,
}: {
  onChange: (color: BlossomColorPickerColor) => void;
  onDismiss: () => void;
  currentHex?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  // After mount, programmatically click the core button to trigger expand.
  // This goes through setExpanded(true) which binds click-outside and animates.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const core = containerRef.current?.querySelector<HTMLButtonElement>(".bcp-core");
      if (core) core.click();
    });
    return () => cancelAnimationFrame(id);
  }, []);

  // On color pick: update color, then trigger collapse animation.
  // onCollapse fires after the animation finishes → unmount.
  const handleChange = useCallback(
    (color: BlossomColorPickerColor) => {
      onChange(color);
      requestAnimationFrame(() => {
        const core = containerRef.current?.querySelector<HTMLButtonElement>(".bcp-core");
        if (core) core.click();
      });
    },
    [onChange],
  );

  return (
    <div ref={containerRef} className="absolute top-full left-0 z-10 mt-2">
      <BlossomColorPicker
        defaultValue={currentHex ? hexToPickerValue(currentHex) : undefined}
        onChange={handleChange}
        onCollapse={onDismiss}
        coreSize={28}
        petalSize={28}
        animationDuration={400}
        showAlphaSlider={false}
      />
    </div>
  );
}

interface ColorSchemePickerProps {
  value: { primary?: string; accent?: string };
  onChange: (scheme: { primary?: string; accent?: string }) => void;
}

export function ColorSchemePicker({ value, onChange }: ColorSchemePickerProps) {
  const hasSomething = value.primary || value.accent;
  const [activePicker, setActivePicker] = useState<"primary" | "accent" | null>(null);

  const handleColorChange = useCallback(
    (color: BlossomColorPickerColor) => {
      if (activePicker === "primary") {
        onChange({ ...value, primary: color.hex });
      } else if (activePicker === "accent") {
        onChange({ ...value, accent: color.hex });
      }
    },
    [value, onChange, activePicker],
  );

  const handleDismiss = useCallback(() => {
    setActivePicker(null);
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-6">
        <div className="relative flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">Primary</Label>
          <button
            type="button"
            onClick={() => setActivePicker(activePicker === "primary" ? null : "primary")}
            className={cn(
              "h-8 w-8 rounded-md border-2 transition-all cursor-pointer",
              activePicker === "primary"
                ? "border-primary ring-2 ring-primary/20"
                : "border-input hover:border-primary/50",
            )}
            style={{ backgroundColor: value.primary || "#6366f1" }}
          />
          {activePicker === "primary" && (
            <PickerDropdown onChange={handleColorChange} onDismiss={handleDismiss} currentHex={value.primary} />
          )}
        </div>
        <div className="relative flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">Accent</Label>
          <button
            type="button"
            onClick={() => setActivePicker(activePicker === "accent" ? null : "accent")}
            className={cn(
              "h-8 w-8 rounded-md border-2 transition-all cursor-pointer",
              activePicker === "accent"
                ? "border-primary ring-2 ring-primary/20"
                : "border-input hover:border-primary/50",
            )}
            style={{ backgroundColor: value.accent || "#f59e0b" }}
          />
          {activePicker === "accent" && (
            <PickerDropdown onChange={handleColorChange} onDismiss={handleDismiss} currentHex={value.accent} />
          )}
        </div>
        {hasSomething && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              onChange({});
              setActivePicker(null);
            }}
            className="h-7 px-2 text-xs"
          >
            <X className="h-3 w-3 mr-1" />
            Clear
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((preset) => {
          const isActive = value.primary === preset.primary && value.accent === preset.accent;
          return (
            <button
              key={preset.name}
              type="button"
              title={preset.name}
              onClick={() => onChange({ primary: preset.primary, accent: preset.accent })}
              className={cn(
                "flex items-center gap-1 rounded-full border px-2 py-1 transition-colors",
                isActive ? "border-primary bg-primary/10" : "border-input hover:border-primary/50",
              )}
            >
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: preset.primary }} />
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: preset.accent }} />
              <span className="text-xs text-muted-foreground ml-0.5">{preset.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
