"use client";

import { Button } from "@claudekit/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@claudekit/ui/components/card";
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
import { Input } from "@claudekit/ui/components/input";
import { Label } from "@claudekit/ui/components/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@claudekit/ui/components/tooltip";
import { CheckCircle2, ExternalLink, Eye, EyeOff, Github, HelpCircle, KeyRound, Loader2, XCircle } from "lucide-react";
import { useState } from "react";
import type { VerifyGitHubResponse } from "@/lib/api";

interface GitHubStepProps {
  token: string;
  onTokenChange: (token: string) => void;
  onContinue: () => void;
  isVerifying: boolean;
  verificationResult: VerifyGitHubResponse | null;
  hasEnvToken: boolean;
  useEnvToken: boolean;
  onUseEnvTokenChange: (useEnvToken: boolean) => void;
}

export function GitHubStep({
  token,
  onTokenChange,
  onContinue,
  isVerifying,
  verificationResult,
  hasEnvToken,
  useEnvToken,
  onUseEnvTokenChange,
}: GitHubStepProps) {
  const [showToken, setShowToken] = useState(false);

  const hasFailed = verificationResult?.success === false;
  const canContinue = useEnvToken || !!token;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Github className="h-5 w-5" />
          <CardTitle>Connect to GitHub</CardTitle>
        </div>
        <CardDescription>
          Enter your GitHub Personal Access Token to allow the agent to access your repository
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasEnvToken && (
          <button
            type="button"
            className={`rounded-lg border p-4 cursor-pointer transition-colors text-left w-full ${
              useEnvToken ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/50"
            }`}
            onClick={() => onUseEnvTokenChange(!useEnvToken)}
          >
            <div className="flex items-center gap-3">
              <KeyRound className="h-5 w-5 text-primary shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium">Use environment variable</p>
                <p className="text-xs text-muted-foreground">
                  <code className="bg-muted px-1 py-0.5 rounded">GITHUB_PERSONAL_ACCESS_TOKEN</code> is set in your
                  environment
                </p>
              </div>
              {useEnvToken && <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />}
            </div>
          </div>
        )}

        {!useEnvToken && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="github-token">Personal Access Token</Label>
              <TooltipProvider>
                <Dialog>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <DialogTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 text-muted-foreground hover:text-foreground"
                        >
                          <HelpCircle className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                    </TooltipTrigger>
                    <TooltipContent>How to create a token</TooltipContent>
                  </Tooltip>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>How to Create a GitHub Personal Access Token</DialogTitle>
                      <DialogDescription>
                        Follow these steps to generate a token with the required permissions.
                      </DialogDescription>
                    </DialogHeader>
                    <DialogBody>
                      <div className="space-y-4 py-4">
                        <div className="space-y-3 text-sm">
                          <div className="flex gap-3">
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-medium">
                              1
                            </span>
                            <p>
                              Go to GitHub <span className="font-medium">Settings</span> →{" "}
                              <span className="font-medium">Developer settings</span> →{" "}
                              <span className="font-medium">Personal access tokens</span> →{" "}
                              <span className="font-medium">Tokens (classic)</span>
                            </p>
                          </div>
                          <div className="flex gap-3">
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-medium">
                              2
                            </span>
                            <p>
                              Click <span className="font-medium">"Generate new token (classic)"</span>
                            </p>
                          </div>
                          <div className="flex gap-3">
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-medium">
                              3
                            </span>
                            <p>Set a descriptive name (e.g., "GoGo")</p>
                          </div>
                          <div className="flex gap-3">
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-medium">
                              4
                            </span>
                            <div>
                              <p className="mb-2">Select the required scopes:</p>
                              <ul className="ml-1 space-y-1 text-muted-foreground">
                                <li className="flex items-center gap-2">
                                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                                  <code className="bg-muted px-1.5 py-0.5 rounded text-xs">repo</code>
                                  <span className="text-xs">Full control of private repositories</span>
                                </li>
                                <li className="flex items-center gap-2">
                                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                                  <code className="bg-muted px-1.5 py-0.5 rounded text-xs">workflow</code>
                                  <span className="text-xs">Update GitHub Action workflows</span>
                                </li>
                              </ul>
                            </div>
                          </div>
                          <div className="flex gap-3">
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-medium">
                              5
                            </span>
                            <p>
                              Click <span className="font-medium">"Generate token"</span> and copy it immediately — you
                              won't see it again!
                            </p>
                          </div>
                        </div>
                      </div>
                    </DialogBody>
                    <DialogFooter>
                      <Button asChild>
                        <a
                          href="https://github.com/settings/tokens/new?scopes=repo,workflow&description=GoGo"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Create Token on GitHub
                          <ExternalLink className="ml-2 h-4 w-4" />
                        </a>
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </TooltipProvider>
            </div>
            <div className="relative">
              <Input
                id="github-token"
                type={showToken ? "text" : "password"}
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                value={token}
                onChange={(e) => onTokenChange(e.target.value)}
                className="pr-10"
              />
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3"
                      onClick={() => setShowToken(!showToken)}
                    >
                      {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{showToken ? "Hide token" : "Show token"}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <p className="text-sm text-muted-foreground">
              Create a{" "}
              <a
                href="https://github.com/settings/tokens/new?scopes=repo,workflow"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline underline-offset-2"
              >
                new token
              </a>{" "}
              with <code className="bg-muted px-1 py-0.5 rounded">repo</code> and{" "}
              <code className="bg-muted px-1 py-0.5 rounded">workflow</code> scopes
            </p>
          </div>
        )}

        {/* Verification error (shown inline on failure) */}
        {hasFailed && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4">
            <div className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-destructive" />
              <span className="text-destructive">{verificationResult?.error || "Verification failed"}</span>
            </div>
          </div>
        )}

        <div className="flex justify-end pt-4">
          <Button onClick={onContinue} disabled={!canContinue || isVerifying}>
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
