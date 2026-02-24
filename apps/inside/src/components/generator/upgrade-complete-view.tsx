"use client";

import { cn } from "@claudekit/ui";
import { Button } from "@claudekit/ui/components/button";
import { CheckCircle2, Clipboard, ExternalLink, Globe, Rocket, Terminal } from "lucide-react";
import { toast } from "sonner";
import { PLATFORM_NEXT_STEPS, SERVICE_NEXT_STEPS } from "@/lib/constants";
import type { GeneratorProject } from "@/lib/types";

interface UpgradeCompleteViewProps {
  project: GeneratorProject;
  port: number | null;
  onOpenBrowser: () => void;
}

export function UpgradeCompleteView({ project, port, onOpenBrowser }: UpgradeCompleteViewProps) {
  const serviceSteps = project.services
    .filter((s) => s in SERVICE_NEXT_STEPS)
    .map((s) => ({ id: s, ...SERVICE_NEXT_STEPS[s] }));
  const deployStep = PLATFORM_NEXT_STEPS[project.platform];

  const cdCommand = `cd ${project.project_path}`;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-lg mx-auto py-8 px-6 space-y-6">
        {/* Success Header */}
        <div className="text-center space-y-2">
          <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto" />
          <h2 className="text-lg font-semibold">Upgrade Complete!</h2>
          <p className="text-sm text-muted-foreground">{project.title}</p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-center gap-3">
          {port && (
            <Button size="sm" onClick={onOpenBrowser}>
              <Globe className="w-4 h-4 mr-1.5" />
              Open in Browser
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              navigator.clipboard.writeText(cdCommand);
              toast.success("Copied to clipboard");
            }}
          >
            <Terminal className="w-4 h-4 mr-1.5" />
            Copy cd command
          </Button>
        </div>

        {/* Next Steps */}
        {serviceSteps.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-medium">Next Steps</h3>
            <div className="space-y-2">
              {serviceSteps.map((step) => (
                <a
                  key={step.id}
                  href={step.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    "flex items-start gap-3 rounded-lg border p-3",
                    "hover:bg-accent/50 transition-colors group",
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{step.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5 group-hover:text-foreground transition-colors" />
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Deploy Section */}
        {deployStep && (
          <div className="space-y-3">
            <h3 className="text-sm font-medium">Deploy</h3>
            <a
              href={deployStep.url}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "flex items-start gap-3 rounded-lg border p-3",
                "hover:bg-accent/50 transition-colors group",
              )}
            >
              <Rocket className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{deployStep.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{deployStep.description}</p>
              </div>
              <ExternalLink className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5 group-hover:text-foreground transition-colors" />
            </a>
          </div>
        )}

        {/* Project Info Footer */}
        <div className="border-t pt-4 space-y-1.5">
          <h3 className="text-sm font-medium mb-2">Project Info</h3>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clipboard className="w-3 h-3 shrink-0" />
            <span className="truncate">{project.project_path}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Terminal className="w-3 h-3 shrink-0" />
            <span>{project.package_manager} run dev</span>
          </div>
        </div>
      </div>
    </div>
  );
}
