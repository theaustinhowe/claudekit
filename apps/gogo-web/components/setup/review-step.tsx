"use client";

import { CheckCircle2, FolderGit2, FolderOpen, Github, Loader2, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { SelectedRepo } from "./setup-wizard";

interface ReviewStepProps {
  githubUsername: string;
  selectedRepos: SelectedRepo[];
  workspacePath: string;
  onBack: () => void;
  onComplete: () => void;
  isCompleting: boolean;
  error: string | null;
}

export function ReviewStep({
  githubUsername,
  selectedRepos,
  workspacePath,
  onBack,
  onComplete,
  isCompleting,
  error,
}: ReviewStepProps) {
  // Collect unique trigger labels for the "what happens next" section
  const uniqueLabels = [...new Set(selectedRepos.map((r) => r.triggerLabel))];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Rocket className="h-5 w-5" />
          <CardTitle>Review & Complete</CardTitle>
        </div>
        <CardDescription>Review your configuration and complete the setup</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Summary sections */}
        <div className="space-y-4">
          {/* GitHub */}
          <div className="rounded-lg border p-4">
            <div className="flex items-center gap-2 mb-2">
              <Github className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">GitHub Connection</span>
              <CheckCircle2 className="h-4 w-4 text-green-500 ml-auto" />
            </div>
            <p className="text-sm text-muted-foreground">
              Connected as <span className="font-medium">{githubUsername}</span>
            </p>
          </div>

          {/* Repositories */}
          <div className="rounded-lg border p-4">
            <div className="flex items-center gap-2 mb-2">
              <FolderGit2 className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">
                {selectedRepos.length === 1 ? "Repository" : `Repositories (${selectedRepos.length})`}
              </span>
              <CheckCircle2 className="h-4 w-4 text-green-500 ml-auto" />
            </div>
            <div className="space-y-2">
              {selectedRepos.map((repo) => (
                <div key={`${repo.owner}/${repo.name}`} className="text-sm text-muted-foreground">
                  <p>
                    <span className="font-medium">
                      {repo.owner}/{repo.name}
                    </span>
                  </p>
                  <p className="ml-4">
                    Trigger: <code className="bg-muted px-1 py-0.5 rounded">{repo.triggerLabel}</code>
                    {" · "}
                    Branch: <code className="bg-muted px-1 py-0.5 rounded">{repo.baseBranch}</code>
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Workspace */}
          <div className="rounded-lg border p-4">
            <div className="flex items-center gap-2 mb-2">
              <FolderOpen className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">Workspace</span>
              <CheckCircle2 className="h-4 w-4 text-green-500 ml-auto" />
            </div>
            <p className="text-sm text-muted-foreground">
              <code className="bg-muted px-1 py-0.5 rounded">{workspacePath}</code>
            </p>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {/* What happens next */}
        <div className="rounded-lg bg-muted/50 p-4">
          <h4 className="font-medium mb-2">What happens next?</h4>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
            <li>
              {selectedRepos.length === 1
                ? "The repository will be registered in your database"
                : `All ${selectedRepos.length} repositories will be registered in your database`}
            </li>
            <li>Polling will start to watch for labeled issues</li>
            <li>
              Label any issue with{" "}
              {uniqueLabels.map((label, i) => (
                <span key={label}>
                  {i > 0 && " or "}
                  <code className="bg-muted px-1 py-0.5 rounded">{label}</code>
                </span>
              ))}{" "}
              to create a job
            </li>
          </ul>
        </div>

        <div className="flex justify-between pt-4">
          <Button variant="outline" onClick={onBack} disabled={isCompleting}>
            Back
          </Button>
          <Button onClick={onComplete} disabled={isCompleting}>
            {isCompleting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Completing Setup
              </>
            ) : (
              <>
                <Rocket className="mr-2 h-4 w-4" />
                Complete Setup
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
