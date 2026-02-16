"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Step {
  id: number;
  title: string;
  description: string;
}

interface StepIndicatorProps {
  steps: Step[];
  currentStep: number;
  completedSteps: number[];
}

export function StepIndicator({ steps, currentStep, completedSteps }: StepIndicatorProps) {
  return (
    <nav aria-label="Progress" className="mb-8">
      <ol className="flex items-center justify-between">
        {steps.map((step, index) => {
          const isCompleted = completedSteps.includes(step.id);
          const isCurrent = currentStep === step.id;
          const isPast = step.id < currentStep;

          return (
            <li key={step.id} className="relative flex flex-1 flex-col items-center">
              {/* Connector line */}
              {index > 0 && (
                <div
                  className={cn(
                    "absolute left-0 top-4 -ml-px h-0.5 w-[calc(50%-1rem)]",
                    isPast || isCompleted ? "bg-primary" : "bg-muted",
                  )}
                  style={{ right: "50%" }}
                />
              )}
              {index < steps.length - 1 && (
                <div
                  className={cn(
                    "absolute right-0 top-4 -mr-px h-0.5 w-[calc(50%-1rem)]",
                    isCompleted ? "bg-primary" : "bg-muted",
                  )}
                  style={{ left: "50%" }}
                />
              )}

              {/* Step circle */}
              <div
                className={cn(
                  "relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm font-medium transition-colors",
                  isCompleted
                    ? "border-primary bg-primary text-primary-foreground"
                    : isCurrent
                      ? "border-primary bg-background text-primary"
                      : "border-muted bg-background text-muted-foreground",
                )}
              >
                {isCompleted ? <Check className="h-4 w-4" /> : step.id}
              </div>

              {/* Step title */}
              <div className="mt-2 text-center">
                <span
                  className={cn(
                    "text-sm font-medium",
                    isCurrent ? "text-foreground" : isCompleted ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  {step.title}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
