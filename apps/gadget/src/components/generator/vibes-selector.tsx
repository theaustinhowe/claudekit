"use client";

import { toast } from "sonner";

import { Card } from "@devkit/ui/components/card";
import { DESIGN_VIBES } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface VibesSelectorProps {
  value: string[];
  onChange: (vibes: string[]) => void;
}

export function VibesSelector({ value, onChange }: VibesSelectorProps) {
  const toggle = (id: string) => {
    if (value.includes(id)) {
      onChange(value.filter((v) => v !== id));
    } else {
      if (value.length >= 3) {
        toast.info("Maximum 3 vibes allowed");
        return;
      }
      onChange([...value, id]);
    }
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {DESIGN_VIBES.map((vibe) => (
        <Card
          key={vibe.id}
          className={cn(
            "cursor-pointer transition-all p-3",
            value.includes(vibe.id) ? "border-primary ring-2 ring-primary/20" : "hover:border-primary/50",
          )}
          onClick={() => toggle(vibe.id)}
        >
          <p className="font-medium text-sm">{vibe.label}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{vibe.description}</p>
        </Card>
      ))}
    </div>
  );
}
