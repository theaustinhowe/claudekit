"use client";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@claudekit/ui/components/alert-dialog";
import { Button } from "@claudekit/ui/components/button";
import { Loader2, Rocket } from "lucide-react";
import { useState } from "react";
import type { GeneratorProject } from "@/lib/types";

interface UpgradeDialogProps {
  project: GeneratorProject;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function UpgradeDialog({ project, open, onOpenChange, onConfirm }: UpgradeDialogProps) {
  const [starting, setStarting] = useState(false);

  const handleConfirm = () => {
    setStarting(true);
    onConfirm();
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Rocket className="h-5 w-5" />
            Upgrade to Full Implementation
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-3">
            <span className="block">
              This will create a git repository, generate an implementation plan, and transform your prototype into a
              production app. The design chat will remain available.
            </span>
            {project.services.length > 0 && (
              <span className="block text-sm">
                <span className="font-medium text-foreground">Services to integrate:</span>{" "}
                {project.services.join(", ")}
              </span>
            )}
            <span className="block text-sm">
              <span className="font-medium text-foreground">Platform:</span> {project.platform}
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={starting}>Cancel</AlertDialogCancel>
          <Button onClick={handleConfirm} disabled={starting}>
            {starting && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Start Upgrade
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
