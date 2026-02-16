"use client";

import { TooltipContent, TooltipProvider, TooltipTrigger, Tooltip as UITooltip } from "@devkit/ui/components/tooltip";

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
