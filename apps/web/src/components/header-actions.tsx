"use client";

import { Hammer, Settings } from "lucide-react";
import { SetupWizardDialog } from "@/components/setup-wizard/setup-wizard-dialog";
import { ToolboxDialog } from "@/components/toolbox/toolbox-dialog";

interface HeaderActionsProps {
  autoOpen?: boolean;
  toolboxToolIds: string[];
}

export function HeaderActions({ autoOpen, toolboxToolIds }: HeaderActionsProps) {
  return (
    <>
      <ToolboxDialog
        initialToolIds={toolboxToolIds}
        trigger={
          <button
            id="toolbox-trigger"
            type="button"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <Hammer className="h-4 w-4" />
            Toolbox
          </button>
        }
      />
      <SetupWizardDialog
        autoOpen={autoOpen}
        trigger={
          <button
            id="setup-wizard-trigger"
            type="button"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <Settings className="h-4 w-4" />
            Setup
          </button>
        }
      />
    </>
  );
}
