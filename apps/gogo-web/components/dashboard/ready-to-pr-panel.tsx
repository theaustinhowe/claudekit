"use client";

import type { Job } from "@devkit/gogo-shared";
import { AlertTriangle, CheckCircle2, ChevronDown, Loader2, RefreshCw, TestTube, Wrench } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

interface ReadyToPrPanelProps {
  job: Job;
  onCreatePr: () => void;
  isPending: boolean;
}

/**
 * Determine the current phase based on job state
 */
function getTestPhase(job: Job): {
  phase: "testing" | "fixing" | "creating-pr";
  label: string;
  description: string;
  progress: number;
} {
  const hasFailedTests = Boolean(job.lastTestOutput);
  const isRetrying = job.testRetryCount > 0;

  if (hasFailedTests && isRetrying) {
    // Agent is fixing issues after test failure
    return {
      phase: "fixing",
      label: "Fixing Issues",
      description: "Agent is addressing test failures",
      progress: 50,
    };
  }

  if (isRetrying) {
    // Re-running tests after fixes
    return {
      phase: "testing",
      label: `Running Tests (Attempt ${job.testRetryCount + 1})`,
      description: "Verifying fixes work",
      progress: 75,
    };
  }

  // First test run
  return {
    phase: "testing",
    label: "Running Tests",
    description: "Verifying changes before creating PR",
    progress: 25,
  };
}

export function ReadyToPrPanel({ job, onCreatePr, isPending }: ReadyToPrPanelProps) {
  const [showTestOutput, setShowTestOutput] = useState(false);
  const hasRetries = job.testRetryCount > 0;
  const testPhase = getTestPhase(job);

  return (
    <Card className="border-purple-200 dark:border-purple-900 bg-purple-50 dark:bg-purple-950/30">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base text-purple-700 dark:text-purple-400">
            {testPhase.phase === "fixing" ? (
              <Wrench className="h-5 w-5" />
            ) : (
              <Loader2 className="h-5 w-5 animate-spin" />
            )}
            {testPhase.label}
          </CardTitle>
          {hasRetries && (
            <Badge
              variant="outline"
              className="text-orange-600 border-orange-300 dark:text-orange-400 dark:border-orange-700"
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Attempt {job.testRetryCount + 1}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Test Progress Indicator */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{testPhase.description}</span>
            <span className="text-purple-600 dark:text-purple-400 font-medium">{testPhase.progress}%</span>
          </div>
          <Progress value={testPhase.progress} className="h-2" />

          {/* Phase steps */}
          <div className="flex items-center justify-between text-xs pt-1">
            <div className="flex items-center gap-1">
              {testPhase.progress >= 25 ? (
                <CheckCircle2 className="h-3 w-3 text-green-500" />
              ) : (
                <Loader2 className="h-3 w-3 animate-spin text-purple-500" />
              )}
              <span
                className={testPhase.progress >= 25 ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}
              >
                Test
              </span>
            </div>
            <div className="flex items-center gap-1">
              {testPhase.progress > 50 ? (
                <CheckCircle2 className="h-3 w-3 text-green-500" />
              ) : testPhase.phase === "fixing" ? (
                <Loader2 className="h-3 w-3 animate-spin text-purple-500" />
              ) : (
                <div className="h-3 w-3 rounded-full border border-muted-foreground/30" />
              )}
              <span
                className={
                  testPhase.progress > 50 || testPhase.phase === "fixing"
                    ? testPhase.phase === "fixing"
                      ? "text-purple-600 dark:text-purple-400"
                      : "text-green-600 dark:text-green-400"
                    : "text-muted-foreground"
                }
              >
                Fix
              </span>
            </div>
            <div className="flex items-center gap-1">
              <div className="h-3 w-3 rounded-full border border-muted-foreground/30" />
              <span className="text-muted-foreground">PR</span>
            </div>
          </div>
        </div>

        {/* Current status panel */}
        <div
          className={`flex items-center gap-3 p-3 rounded-lg ${
            testPhase.phase === "fixing" ? "bg-orange-100 dark:bg-orange-900/30" : "bg-purple-100 dark:bg-purple-900/30"
          }`}
        >
          {testPhase.phase === "fixing" ? (
            <>
              <Wrench className="h-5 w-5 text-orange-600 dark:text-orange-400" />
              <div className="flex-1">
                <p className="text-sm font-medium text-orange-700 dark:text-orange-300">Fixing test failures...</p>
                <p className="text-xs text-orange-600 dark:text-orange-400">
                  Agent is automatically addressing issues from attempt {job.testRetryCount}
                </p>
              </div>
            </>
          ) : (
            <>
              <Loader2 className="h-5 w-5 animate-spin text-purple-600 dark:text-purple-400" />
              <div className="flex-1">
                <p className="text-sm font-medium text-purple-700 dark:text-purple-300">
                  {hasRetries ? "Re-running tests after fixes..." : "Running tests..."}
                </p>
                <p className="text-xs text-purple-600 dark:text-purple-400">PR will be created when tests pass</p>
              </div>
            </>
          )}
        </div>

        {/* Change Summary if available */}
        {job.changeSummary && (
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1">Changes:</p>
            <div className="bg-white dark:bg-gray-900 rounded-md p-3 text-sm border font-mono whitespace-pre-wrap max-h-32 overflow-y-auto">
              {job.changeSummary}
            </div>
          </div>
        )}

        {/* Last Test Output (collapsible) - more prominent when present */}
        {job.lastTestOutput && (
          <div className="border border-orange-200 dark:border-orange-800 rounded-lg overflow-hidden">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-between bg-orange-50 dark:bg-orange-950/50 hover:bg-orange-100 dark:hover:bg-orange-900/50 rounded-none text-orange-700 dark:text-orange-300"
              onClick={() => setShowTestOutput(!showTestOutput)}
            >
              <span className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                <span className="font-medium">Test failures from attempt {job.testRetryCount}</span>
              </span>
              <ChevronDown className={`h-4 w-4 transition-transform ${showTestOutput ? "rotate-180" : ""}`} />
            </Button>
            {showTestOutput && (
              <div className="bg-red-50 dark:bg-red-950/30 p-3 text-sm font-mono whitespace-pre-wrap overflow-x-auto max-h-64 overflow-y-auto text-red-800 dark:text-red-200">
                {job.lastTestOutput}
              </div>
            )}
          </div>
        )}

        {/* Manual trigger button (fallback if auto doesn't start) */}
        {!isPending && (
          <Button variant="outline" className="w-full" onClick={onCreatePr} disabled={isPending}>
            <TestTube className="h-4 w-4 mr-2" />
            Trigger PR Creation
          </Button>
        )}

        <div className="text-xs text-muted-foreground bg-purple-50/50 dark:bg-purple-950/20 rounded-md p-3 border border-purple-100 dark:border-purple-900/50">
          <p className="font-medium text-purple-700 dark:text-purple-400 mb-1">What happens next:</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>Tests verify the changes work</li>
            <li>
              If tests <span className="text-green-600 dark:text-green-400 font-medium">pass</span>: PR is created and
              the agent monitors for review comments
            </li>
            <li>
              If tests <span className="text-red-600 dark:text-red-400 font-medium">fail</span>: The agent automatically
              fixes the issues
            </li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}
