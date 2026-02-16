"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import * as React from "react";

import { cn } from "../utils";

const Dialog = DialogPrimitive.Root;

function DialogTrigger({
  asChild,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Trigger> & { asChild?: boolean }) {
  if (asChild && React.isValidElement(children)) {
    return <DialogPrimitive.Trigger render={children} {...props} />;
  }
  return <DialogPrimitive.Trigger {...props}>{children}</DialogPrimitive.Trigger>;
}

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Backdrop>>(
  ({ className, ...props }, ref) => (
    <DialogPrimitive.Backdrop
      ref={ref}
      className={cn(
        "fixed inset-0 z-50 bg-black/80 data-[open]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[open]:fade-in-0 data-[open]:duration-[var(--dlg-open-dur,200ms)] data-[closed]:duration-[var(--dlg-close-dur,150ms)]",
        className,
      )}
      {...props}
    />
  ),
);
DialogOverlay.displayName = "DialogOverlay";

interface DialogContentProps extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Popup> {
  /** Animation duration in ms. Close duration is 75% of open. Default 200. */
  duration?: number;
}

const DialogContent = React.forwardRef<HTMLDivElement, DialogContentProps>(
  ({ className, children, duration, style, ...props }, ref) => {
    const durationStyle =
      duration != null
        ? ({
            "--dlg-open-dur": `${duration}ms`,
            "--dlg-close-dur": `${Math.round(duration * 0.75)}ms`,
            ...style,
          } as React.CSSProperties & Record<string, string>)
        : style;

    return (
      <DialogPortal>
        <DialogOverlay style={durationStyle} />
        <DialogPrimitive.Popup
          ref={ref}
          style={durationStyle}
          className={cn(
            "fixed left-[50%] top-[50%] z-50 flex flex-col w-full max-w-lg max-h-[85vh] overflow-y-auto overflow-x-hidden translate-x-[-50%] translate-y-[-50%] border bg-background p-6 shadow-lg data-[open]:duration-[var(--dlg-open-dur,200ms)] data-[closed]:duration-[var(--dlg-close-dur,150ms)] data-[open]:ease-out data-[closed]:ease-in data-[open]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[open]:fade-in-0 data-[closed]:zoom-out-95 data-[open]:zoom-in-95 data-[closed]:slide-out-to-left-1/2 data-[closed]:slide-out-to-top-[48%] data-[open]:slide-in-from-left-1/2 data-[open]:slide-in-from-top-[48%] sm:rounded-lg",
            className,
          )}
          {...props}
        >
          {children}
          <DialogPrimitive.Close className="absolute right-4 top-4 z-30 rounded-xs opacity-70 ring-offset-background transition-opacity data-[open]:bg-accent data-[open]:text-muted-foreground hover:opacity-100 focus:outline-hidden focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        </DialogPrimitive.Popup>
      </DialogPortal>
    );
  },
);
DialogContent.displayName = "DialogContent";

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("flex flex-col space-y-1.5 text-center sm:text-left shrink-0 -mx-6 -mt-6 px-6 pt-4 pb-3", className)}
    {...props}
  />
);
DialogHeader.displayName = "DialogHeader";

const DialogBody = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex-1 min-h-0 overflow-y-auto -mx-6 px-6", className)} {...props} />
);
DialogBody.displayName = "DialogBody";

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      "shrink-0 -mx-6 -mb-6 px-6 pt-3 pb-3 border-t border-border",
      className,
    )}
    {...props}
  />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<HTMLHeadingElement, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>>(
  ({ className, ...props }, ref) => (
    <DialogPrimitive.Title
      ref={ref}
      className={cn("text-lg font-semibold leading-none tracking-tight", className)}
      {...props}
    />
  ),
);
DialogTitle.displayName = "DialogTitle";

const DialogDescription = React.forwardRef<
  HTMLParagraphElement,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
));
DialogDescription.displayName = "DialogDescription";

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
