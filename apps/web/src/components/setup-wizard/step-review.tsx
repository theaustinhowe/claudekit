"use client";

import { cn } from "@claudekit/ui";
import { Badge } from "@claudekit/ui/components/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@claudekit/ui/components/collapsible";
import { AlertTriangle, ChevronRight, Eye, EyeOff, FileText } from "lucide-react";
import { useState } from "react";
import type { SetupWizardData } from "@/lib/env-parser";

const SENSITIVE_PATTERNS = /token|key|secret|password|pat$/i;

interface StepReviewProps {
  wizardData: SetupWizardData;
  values: Record<string, string>;
}

interface FileEntry {
  path: string;
  variables: Array<{ key: string; value: string; required: boolean }>;
}

function buildFileEntries(wizardData: SetupWizardData, values: Record<string, string>): FileEntry[] {
  const fileMap = new Map<string, FileEntry>();

  const ensureFile = (path: string) => {
    let entry = fileMap.get(path);
    if (!entry) {
      entry = { path, variables: [] };
      fileMap.set(path, entry);
    }
    return entry;
  };

  // Shared variables
  for (const v of wizardData.sharedVariables) {
    for (const source of v.sources) {
      let path: string;
      switch (source.appId) {
        case "root":
          path = ".env.local";
          break;
        case "gadget":
          path = "apps/gadget/.env.local";
          break;
        default:
          path = `apps/${source.appId}/.env.local`;
      }
      const file = ensureFile(path);
      file.variables.push({ key: v.key, value: values[v.key] ?? "", required: v.required });
    }
  }

  // App-specific variables
  for (const [appId, { variables }] of Object.entries(wizardData.appVariables)) {
    const path = appId === "root" ? ".env.local" : `apps/${appId}/.env.local`;
    const file = ensureFile(path);
    for (const v of variables) {
      file.variables.push({ key: v.key, value: values[v.key] ?? "", required: v.required });
    }
  }

  return [...fileMap.values()].filter((f) => f.variables.length > 0);
}

export function StepReview({ wizardData, values }: StepReviewProps) {
  const [showValues, setShowValues] = useState(false);
  const files = buildFileEntries(wizardData, values);

  const totalVars = files.reduce((sum, f) => sum + f.variables.length, 0);
  const emptyRequired = files.flatMap((f) => f.variables).filter((v) => v.required && !v.value);

  return (
    <div className="space-y-4 py-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {files.length} files will be written with {totalVars} variables.
        </p>
        <button
          type="button"
          onClick={() => setShowValues((prev) => !prev)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {showValues ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          {showValues ? "Hide" : "Show"} values
        </button>
      </div>

      {emptyRequired.length > 0 && (
        <div className="flex items-start gap-2 rounded-md bg-warning/10 border border-warning/30 px-3 py-2">
          <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
          <p className="text-xs text-warning">
            {emptyRequired.length} required {emptyRequired.length === 1 ? "variable is" : "variables are"} empty:{" "}
            {emptyRequired.map((v) => v.key).join(", ")}
          </p>
        </div>
      )}

      <div className="space-y-2">
        {files.map((file) => (
          <Collapsible key={file.path} className="group/file border rounded-lg overflow-hidden">
            <CollapsibleTrigger className="flex items-center gap-2 w-full px-3 py-2 bg-muted/50 hover:bg-muted/80 transition-colors">
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground transition-transform duration-150 group-data-[open]/file:rotate-90" />
              <FileText className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="font-mono text-xs font-medium">{file.path}</span>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 ml-auto">
                {file.variables.length} vars
              </Badge>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="divide-y">
                {file.variables.map((v) => (
                  <div key={v.key} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                    <span className={cn("font-mono", !v.value && v.required && "text-warning")}>{v.key}</span>
                    {!v.value && v.required && <AlertTriangle className="h-3 w-3 text-warning" />}
                    <span className="ml-auto font-mono text-muted-foreground truncate max-w-[300px]">
                      {v.value ? (showValues ? v.value : SENSITIVE_PATTERNS.test(v.key) ? "••••••••" : v.value) : "—"}
                    </span>
                  </div>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        ))}
      </div>

      <p className="text-xs text-muted-foreground italic">Restart dev servers to pick up new environment variables.</p>
    </div>
  );
}
