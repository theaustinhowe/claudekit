"use client";

import { Slider as SliderPrimitive } from "@base-ui/react/slider";
import * as React from "react";

import { cn } from "../utils";

interface SliderProps
  extends Omit<
    React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>,
    "onValueChange" | "value" | "defaultValue"
  > {
  value?: number[];
  defaultValue?: number[];
  onValueChange?: (value: number[]) => void;
}

const Slider = React.forwardRef<HTMLDivElement, SliderProps>(
  ({ className, value, defaultValue, onValueChange, ...props }, ref) => {
    const thumbCount = (value ?? defaultValue ?? [0]).length;
    return (
      <SliderPrimitive.Root
        ref={ref}
        className={cn(
          "relative flex w-full touch-none select-none items-center data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed",
          className,
        )}
        onValueChange={
          onValueChange ? (v: number | readonly number[]) => onValueChange(Array.isArray(v) ? [...v] : [v]) : undefined
        }
        value={value}
        defaultValue={defaultValue}
        {...props}
      >
        <SliderPrimitive.Control className="relative flex w-full items-center">
          <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-secondary">
            <SliderPrimitive.Indicator className="absolute h-full bg-primary" />
          </SliderPrimitive.Track>
          {Array.from({ length: thumbCount }, (_, i) => (
            <SliderPrimitive.Thumb
              // biome-ignore lint/suspicious/noArrayIndexKey: slider thumbs are fixed-count, stable order
              key={i}
              className="block h-5 w-5 rounded-full border-2 border-primary bg-background ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
            />
          ))}
        </SliderPrimitive.Control>
      </SliderPrimitive.Root>
    );
  },
);
Slider.displayName = "Slider";

export { Slider };
