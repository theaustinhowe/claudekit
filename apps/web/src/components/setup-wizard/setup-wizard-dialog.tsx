"use client";

import { Button } from "@claudekit/ui/components/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@claudekit/ui/components/dialog";
import { TooltipProvider } from "@claudekit/ui/components/tooltip";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { loadSetupData, saveSetupEnv } from "@/lib/actions/setup-wizard";
import type { SetupWizardData } from "@/lib/env-parser";
import { StepAppSpecific } from "./step-app-specific";
import { StepIndicator } from "./step-indicator";
import { StepReview } from "./step-review";
import { StepShared } from "./step-shared";

interface SetupWizardDialogProps {
  trigger: React.ReactNode;
  autoOpen?: boolean;
}

export function SetupWizardDialog({ trigger, autoOpen }: SetupWizardDialogProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (autoOpen) setOpen(true);
  }, [autoOpen]);
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<Record<string, string>>({});
  const [wizardData, setWizardData] = useState<SetupWizardData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setIsLoading(true);
    setStep(0);
    loadSetupData()
      .then((data) => {
        setWizardData(data);
        setValues(data.existingValues);
      })
      .catch(() => {
        toast.error("Failed to load environment configuration");
      })
      .finally(() => setIsLoading(false));
  }, [open]);

  const handleChange = useCallback((key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      const result = await saveSetupEnv(values);
      if (result.success) {
        toast.success(`Saved to ${result.filesWritten.length} files`, {
          description: result.filesWritten.map((f) => `• ${f}`).join("\n"),
        });
        setOpen(false);
      } else {
        toast.error("Some files failed to save", {
          description: result.errors.join("\n"),
        });
      }
    } catch {
      toast.error("Failed to save environment configuration");
    } finally {
      setIsSaving(false);
    }
  }, [values]);

  const isLastStep = step === 2;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-4xl">
        <TooltipProvider delayDuration={300}>
          <DialogHeader className="space-y-3 pb-4">
            <div className="space-y-1">
              <DialogTitle>Environment Setup</DialogTitle>
              <DialogDescription>Configure environment variables for all claudekit apps.</DialogDescription>
            </div>
            <StepIndicator currentStep={step} />
          </DialogHeader>

          <DialogBody>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : wizardData ? (
              <>
                {step === 0 && (
                  <StepShared variables={wizardData.sharedVariables} values={values} onChange={handleChange} />
                )}
                {step === 1 && (
                  <StepAppSpecific appVariables={wizardData.appVariables} values={values} onChange={handleChange} />
                )}
                {step === 2 && <StepReview wizardData={wizardData} values={values} />}
              </>
            ) : null}
          </DialogBody>

          <DialogFooter>
            <div className="flex items-center justify-between w-full">
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={isSaving}>
                {isLastStep ? "Cancel" : "Skip"}
              </Button>
              <div className="flex items-center gap-2">
                {step > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => setStep((s) => s - 1)} disabled={isSaving}>
                    Back
                  </Button>
                )}
                {isLastStep ? (
                  <Button size="sm" onClick={handleSave} disabled={isLoading || isSaving}>
                    {isSaving ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-1" />
                        Saving...
                      </>
                    ) : (
                      "Save All"
                    )}
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => setStep((s) => s + 1)} disabled={isLoading}>
                    Next
                  </Button>
                )}
              </div>
            </div>
          </DialogFooter>
        </TooltipProvider>
      </DialogContent>
    </Dialog>
  );
}
