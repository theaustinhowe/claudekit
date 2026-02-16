"use client";

import { cn } from "@devkit/ui";
import { Badge } from "@devkit/ui/components/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@devkit/ui/components/collapsible";
import { BookOpen, ChevronDown, Cpu, Rocket, Video } from "lucide-react";
import type { EnvVariable } from "@/lib/env-parser";
import { EnvField } from "./env-field";

const APP_ICONS: Record<string, React.ReactNode> = {
  b4u: <Video className="h-4 w-4" />,
  gadget: <Rocket className="h-4 w-4" />,
  "gogo-web": <Cpu className="h-4 w-4" />,
  "gogo-orchestrator": <BookOpen className="h-4 w-4" />,
};

interface StepAppSpecificProps {
  appVariables: Record<string, { label: string; variables: EnvVariable[] }>;
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}

export function StepAppSpecific({ appVariables, values, onChange }: StepAppSpecificProps) {
  const appIds = Object.keys(appVariables);

  if (appIds.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        <p>No app-specific variables found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 py-4">
      <p className="text-sm text-muted-foreground">These variables are specific to individual apps.</p>
      {appIds.map((appId) => {
        const { label, variables } = appVariables[appId];
        const configuredCount = variables.filter((v) => values[v.key]).length;
        return (
          <Collapsible key={appId} defaultOpen={variables.length <= 4}>
            <div className="border rounded-lg">
              <CollapsibleTrigger className="flex items-center gap-2 w-full px-4 py-3 hover:bg-accent/50 transition-colors group">
                <span className="text-primary">{APP_ICONS[appId]}</span>
                <span className="font-medium text-sm">{label}</span>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 ml-1">
                  {configuredCount}/{variables.length}
                </Badge>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 ml-auto text-muted-foreground transition-transform group-data-[open]:rotate-180",
                  )}
                />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="px-4 pb-4 space-y-5 border-t">
                  <div className="pt-4 space-y-5">
                    {variables.map((v) => (
                      <EnvField
                        key={v.key}
                        variableKey={v.key}
                        description={v.description}
                        required={v.required}
                        placeholder={v.placeholder}
                        defaultValue={v.defaultValue}
                        value={values[v.key] ?? ""}
                        onChange={onChange}
                      />
                    ))}
                  </div>
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>
        );
      })}
    </div>
  );
}
