"use client";

import { Progress as ProgressPrimitive } from "@base-ui/react/progress";
import * as React from "react";

import { cn } from "../utils";

const Progress = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root>>(
  ({ className, value, ...props }, ref) => (
    <ProgressPrimitive.Root ref={ref} value={value} {...props}>
      <ProgressPrimitive.Track
        className={cn("relative h-4 w-full overflow-hidden rounded-full bg-secondary", className)}
      >
        <ProgressPrimitive.Indicator
          className="h-full w-full flex-1 bg-primary transition-all"
          style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
        />
      </ProgressPrimitive.Track>
    </ProgressPrimitive.Root>
  ),
);
Progress.displayName = "Progress";

export { Progress };
