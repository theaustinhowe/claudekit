"use client";

import { cn } from "@claudekit/ui";
import { Button } from "@claudekit/ui/components/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@claudekit/ui/components/dialog";
import { Input } from "@claudekit/ui/components/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@claudekit/ui/components/select";
import { Slider } from "@claudekit/ui/components/slider";
import { useState } from "react";

interface MaturityInfo {
  label: string;
  percentage: number;
  color: "green" | "yellow" | "red";
}

interface MaturityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appName: string;
  maturity: MaturityInfo;
  onSave: (maturity: MaturityInfo) => void;
}

const DOT_COLORS: Record<string, string> = {
  green: "bg-green-500",
  yellow: "bg-yellow-500",
  red: "bg-red-500",
};

const BAR_COLORS: Record<string, string> = {
  green: "bg-green-500",
  yellow: "bg-yellow-500",
  red: "bg-red-500",
};

export function MaturityDialog({ open, onOpenChange, appName, maturity, onSave }: MaturityDialogProps) {
  const [label, setLabel] = useState(maturity.label);
  const [percentage, setPercentage] = useState(maturity.percentage);
  const [color, setColor] = useState<"green" | "yellow" | "red">(maturity.color);

  const handleSave = () => {
    onSave({ label: label.trim() || maturity.label, percentage, color });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Maturity — {appName}</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-5">
          {/* Live preview */}
          <div className="flex items-center gap-3 rounded-lg border p-3 bg-muted/30">
            <span className={cn("inline-block h-2.5 w-2.5 rounded-full", DOT_COLORS[color])} />
            <span className="text-sm font-medium">{label || "Label"}</span>
            <span className="text-xs text-muted-foreground ml-auto">{percentage}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted -mt-3 mx-0">
            <div
              className={cn("h-full rounded-full transition-all", BAR_COLORS[color])}
              style={{ width: `${percentage}%` }}
            />
          </div>

          {/* Label */}
          <div className="space-y-2">
            <label htmlFor="maturity-label" className="text-sm font-medium">
              Label
            </label>
            <Input
              id="maturity-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Alpha, Beta, Stable"
            />
          </div>

          {/* Percentage */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="maturity-percentage" className="text-sm font-medium">
                Progress
              </label>
              <span className="text-sm text-muted-foreground tabular-nums">{percentage}%</span>
            </div>
            <Slider
              id="maturity-percentage"
              value={[percentage]}
              onValueChange={(v) => setPercentage(v[0])}
              min={0}
              max={100}
              step={5}
            />
          </div>

          {/* Color */}
          <div className="space-y-2">
            <label htmlFor="maturity-color" className="text-sm font-medium">
              Color
            </label>
            <Select value={color} onValueChange={(v) => setColor(v as "green" | "yellow" | "red")}>
              <SelectTrigger id="maturity-color">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="red">
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" />
                    Red
                  </div>
                </SelectItem>
                <SelectItem value="yellow">
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-2.5 w-2.5 rounded-full bg-yellow-500" />
                    Yellow
                  </div>
                </SelectItem>
                <SelectItem value="green">
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500" />
                    Green
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
