"use client";

import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible";
import * as React from "react";
import { cn } from "../utils";
import { Button } from "./button";

const Collapsible = CollapsiblePrimitive.Root;

function CollapsibleTrigger({
  asChild,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof CollapsiblePrimitive.Trigger> & { asChild?: boolean }) {
  if (asChild && React.isValidElement(children)) {
    const isNativeButton =
      (typeof children.type === "string" && children.type === "button") || children.type === Button;
    return <CollapsiblePrimitive.Trigger render={children} nativeButton={isNativeButton} {...props} />;
  }
  return <CollapsiblePrimitive.Trigger {...props}>{children}</CollapsiblePrimitive.Trigger>;
}

const CollapsibleContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof CollapsiblePrimitive.Panel>
>(({ className, ...props }, ref) => (
  <CollapsiblePrimitive.Panel
    ref={ref}
    className={cn(
      "overflow-hidden data-[open]:animate-collapsible-down data-[closed]:animate-collapsible-up",
      className,
    )}
    {...props}
  />
));
CollapsibleContent.displayName = "CollapsibleContent";

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
