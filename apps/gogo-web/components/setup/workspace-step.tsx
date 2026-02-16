"use client";

import { FolderOpen, Loader2, XCircle } from "lucide-react";
import { Button } from "@devkit/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@devkit/ui/components/card";
import { Input } from "@devkit/ui/components/input";
import { Label } from "@devkit/ui/components/label";
import type { VerifyWorkspaceResponse } from "@/lib/api";

interface WorkspaceStepProps {
  path: string;
  onPathChange: (path: string) => void;
  onContinue: () => void;
  onBack: () => void;
  isVerifying: boolean;
  verificationResult: VerifyWorkspaceResponse | null;
}

export function WorkspaceStep({
  path,
  onPathChange,
  onContinue,
  onBack,
  isVerifying,
  verificationResult,
}: WorkspaceStepProps) {
  const hasFailed =
    verificationResult != null &&
    !(verificationResult.success === true && (verificationResult.data?.writable || verificationResult.data?.canCreate));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <FolderOpen className="h-5 w-5" />
          <CardTitle>Workspace Directory</CardTitle>
        </div>
        <CardDescription>Choose where the agent will store its work files and git worktrees</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="workspace-path">Directory Path</Label>
          <Input
            id="workspace-path"
            placeholder="/tmp/agent-work"
            value={path}
            onChange={(e) => onPathChange(e.target.value)}
          />
          <p className="text-sm text-muted-foreground">
            This directory will be created if it doesn't exist. Make sure you have write permissions.
          </p>
        </div>

        {/* Verification error (shown inline on failure) */}
        {hasFailed && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4">
            <div className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-destructive" />
              <span className="text-destructive">
                {verificationResult?.error ||
                  (verificationResult?.success &&
                  !verificationResult.data?.writable &&
                  !verificationResult.data?.canCreate
                    ? "Directory is not writable and cannot be created"
                    : "Verification failed")}
              </span>
            </div>
          </div>
        )}

        <div className="flex justify-between pt-4">
          <Button variant="outline" onClick={onBack}>
            Back
          </Button>
          <Button onClick={onContinue} disabled={!path || isVerifying}>
            {isVerifying ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Verifying
              </>
            ) : (
              "Continue"
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
