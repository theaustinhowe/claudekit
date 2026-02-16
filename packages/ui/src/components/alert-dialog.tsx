"use client";

import { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog";
import * as React from "react";
import { cn } from "../utils";
import { buttonVariants } from "./button";

const AlertDialog = AlertDialogPrimitive.Root;

function AlertDialogTrigger({
  asChild,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Trigger> & { asChild?: boolean }) {
  if (asChild && React.isValidElement(children)) {
    return <AlertDialogPrimitive.Trigger render={children} {...props} />;
  }
  return <AlertDialogPrimitive.Trigger {...props}>{children}</AlertDialogPrimitive.Trigger>;
}

const AlertDialogPortal = AlertDialogPrimitive.Portal;

const AlertDialogOverlay = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Backdrop>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Backdrop
    className={cn(
      "fixed inset-0 z-50 bg-black/80 data-[open]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[open]:fade-in-0 data-[open]:duration-[var(--dlg-open-dur,200ms)] data-[closed]:duration-[var(--dlg-close-dur,150ms)]",
      className,
    )}
    {...props}
    ref={ref}
  />
));
AlertDialogOverlay.displayName = "AlertDialogOverlay";

interface AlertDialogContentProps extends React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Popup> {
  /** Animation duration in ms. Close duration is 75% of open. Default 200. */
  duration?: number;
}

const AlertDialogContent = React.forwardRef<HTMLDivElement, AlertDialogContentProps>(
  ({ className, duration, style, ...props }, ref) => {
    const durationStyle =
      duration != null
        ? ({
            "--dlg-open-dur": `${duration}ms`,
            "--dlg-close-dur": `${Math.round(duration * 0.75)}ms`,
            ...style,
          } as React.CSSProperties & Record<string, string>)
        : style;

    return (
      <AlertDialogPortal>
        <AlertDialogOverlay style={durationStyle} />
        <AlertDialogPrimitive.Popup
          ref={ref}
          style={durationStyle}
          className={cn(
            "fixed left-[50%] top-[50%] z-50 flex flex-col w-full max-w-lg max-h-[85vh] overflow-y-auto overflow-x-hidden translate-x-[-50%] translate-y-[-50%] border bg-background p-6 shadow-lg data-[open]:duration-[var(--dlg-open-dur,200ms)] data-[closed]:duration-[var(--dlg-close-dur,150ms)] data-[open]:ease-out data-[closed]:ease-in data-[open]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[open]:fade-in-0 data-[closed]:zoom-out-95 data-[open]:zoom-in-95 data-[closed]:slide-out-to-left-1/2 data-[closed]:slide-out-to-top-[48%] data-[open]:slide-in-from-left-1/2 data-[open]:slide-in-from-top-[48%] sm:rounded-lg",
            className,
          )}
          {...props}
        />
      </AlertDialogPortal>
    );
  },
);
AlertDialogContent.displayName = "AlertDialogContent";

const AlertDialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("flex flex-col space-y-2 text-center sm:text-left shrink-0 -mx-6 -mt-6 px-6 pt-4 pb-3", className)}
    {...props}
  />
);
AlertDialogHeader.displayName = "AlertDialogHeader";

const AlertDialogBody = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex-1 min-h-0 overflow-y-auto -mx-6 px-6", className)} {...props} />
);
AlertDialogBody.displayName = "AlertDialogBody";

const AlertDialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      "shrink-0 mt-auto -mx-6 -mb-6 px-6 pt-3 pb-3 border-t border-border",
      className,
    )}
    {...props}
  />
);
AlertDialogFooter.displayName = "AlertDialogFooter";

const AlertDialogTitle = React.forwardRef<
  HTMLHeadingElement,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Title ref={ref} className={cn("text-lg font-semibold", className)} {...props} />
));
AlertDialogTitle.displayName = "AlertDialogTitle";

const AlertDialogDescription = React.forwardRef<
  HTMLParagraphElement,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Description ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
));
AlertDialogDescription.displayName = "AlertDialogDescription";

const AlertDialogAction = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ className, ...props }, ref) => <button ref={ref} className={cn(buttonVariants(), className)} {...props} />,
);
AlertDialogAction.displayName = "AlertDialogAction";

const AlertDialogCancel = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ className, ...props }, ref) => (
    <AlertDialogPrimitive.Close
      ref={ref}
      className={cn(buttonVariants({ variant: "outline" }), "mt-2 sm:mt-0", className)}
      {...props}
    />
  ),
);
AlertDialogCancel.displayName = "AlertDialogCancel";

export {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogBody,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
};
