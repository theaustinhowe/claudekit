"use client";

import { Button } from "@claudekit/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@claudekit/ui/components/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@claudekit/ui/components/tooltip";
import { Check, Copy, FolderOpen, Terminal } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { openFolderInTerminal } from "@/lib/actions/code-browser";
import type { PlatformRunInstruction } from "@/lib/constants";

interface RunInstructionsPreviewProps {
  instruction: PlatformRunInstruction;
  projectPath: string;
  projectName?: string;
  onViewTerminal?: () => void;
}

export function RunInstructionsPreview({
  instruction,
  projectPath,
  projectName,
  onViewTerminal,
}: RunInstructionsPreviewProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(instruction.runCommand).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [instruction.runCommand]);

  const handleOpenTerminal = useCallback(async () => {
    try {
      const dir = projectName ? `${projectPath}/${projectName}` : projectPath;
      await openFolderInTerminal(dir);
    } catch {
      toast.error("Could not open Terminal");
    }
  }, [projectPath, projectName]);

  return (
    <div className="flex items-center justify-center h-full p-6 bg-muted/30">
      <Card className="max-w-lg w-full">
        <CardHeader>
          <CardTitle className="text-base">{instruction.title}</CardTitle>
          <CardDescription>{instruction.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Run command */}
          <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 font-mono text-sm">
            <span className="text-muted-foreground select-none">$</span>
            <code className="flex-1 truncate">{instruction.runCommand}</code>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={handleCopy}>
                    {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{copied ? "Copied!" : "Copy command"}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          {/* Steps */}
          <ol className="space-y-2 text-sm text-muted-foreground">
            {instruction.steps.map((step, i) => (
              <li key={step} className="flex gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>

          {/* Project path */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground border-t pt-3">
            <FolderOpen className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{projectName ? `${projectPath}/${projectName}` : projectPath}</span>
          </div>

          {/* Action button */}
          {onViewTerminal ? (
            <Button variant="outline" size="sm" className="w-full" onClick={onViewTerminal}>
              <Terminal className="w-3.5 h-3.5 mr-1.5" />
              View Terminal Output
            </Button>
          ) : (
            <Button variant="outline" size="sm" className="w-full" onClick={handleOpenTerminal}>
              <Terminal className="w-3.5 h-3.5 mr-1.5" />
              Open in Terminal
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
