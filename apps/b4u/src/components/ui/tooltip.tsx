"use client";

import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@devkit/ui/components/tooltip";

interface TooltipProps {
  label: string;
  children: React.ReactNode;
  position?: "top" | "bottom" | "left" | "right";
  delay?: number;
}

export function Tooltip({ label, children, position = "top", delay = 400 }: TooltipProps) {
  return (
    <TooltipProvider delayDuration={delay}>
      <UITooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side={position}>{label}</TooltipContent>
      </UITooltip>
    </TooltipProvider>
  );
}
