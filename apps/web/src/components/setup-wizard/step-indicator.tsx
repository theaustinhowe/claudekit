"use client";

import { cn } from "@claudekit/ui";
import { Check } from "lucide-react";

const STEPS = ["Shared", "App-Specific", "Review"] as const;

export function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center justify-center gap-2">
      {STEPS.map((label, index) => {
        const isCompleted = index < currentStep;
        const isActive = index === currentStep;
        return (
          <div key={label} className="flex items-center gap-2">
            {index > 0 && (
              <div className={cn("h-px w-8", index <= currentStep ? "bg-primary" : "bg-muted-foreground/30")} />
            )}
            <div className="flex items-center gap-1.5">
              <div
                className={cn(
                  "flex items-center justify-center h-6 w-6 rounded-full text-xs font-medium transition-colors",
                  isCompleted && "bg-primary text-primary-foreground",
                  isActive && "border-2 border-primary text-primary",
                  !isCompleted && !isActive && "border border-muted-foreground/30 text-muted-foreground",
                )}
              >
                {isCompleted ? <Check className="h-3.5 w-3.5" /> : index + 1}
              </div>
              <span
                className={cn(
                  "text-xs hidden sm:inline",
                  isActive ? "text-foreground font-medium" : "text-muted-foreground",
                )}
              >
                {label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
