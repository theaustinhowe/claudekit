"use client";

import { Settings } from "lucide-react";
import { SetupWizardDialog } from "@/components/setup-wizard/setup-wizard-dialog";

export function HeaderActions() {
  return (
    <SetupWizardDialog
      trigger={
        <button
          type="button"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <Settings className="h-4 w-4" />
          Setup
        </button>
      }
    />
  );
}
