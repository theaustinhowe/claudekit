"use client";

import { cn } from "@claudekit/ui";
import { Badge } from "@claudekit/ui/components/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@claudekit/ui/components/tabs";
import { BookOpen, Cpu, GitPullRequest, Rocket, Video } from "lucide-react";
import type { EnvVariable } from "@/lib/env-parser";
import { EnvField } from "./env-field";

const APP_ICONS: Record<string, React.ReactNode> = {
  b4u: <Video className="h-4 w-4" />,
  gadget: <Rocket className="h-4 w-4" />,
  "gogo-web": <Cpu className="h-4 w-4" />,
  "gogo-orchestrator": <BookOpen className="h-4 w-4" />,
  inspector: <GitPullRequest className="h-4 w-4" />,
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
    <div className="py-4">
      <p className="text-sm text-muted-foreground mb-3">These variables are specific to individual apps.</p>
      <Tabs defaultValue={appIds[0]} className="flex gap-4 min-h-[300px]">
        {/* Sidebar tab list */}
        <TabsList
          className={cn(
            "flex flex-col items-stretch justify-start h-auto w-[160px] shrink-0",
            "rounded-lg bg-muted/50 p-1.5 gap-1",
          )}
        >
          {appIds.map((appId) => {
            const { label, variables } = appVariables[appId];
            const configuredCount = variables.filter((v) => values[v.key]).length;
            return (
              <TabsTrigger
                key={appId}
                value={appId}
                className={cn(
                  "flex items-center gap-2 justify-start w-full px-3 py-2 rounded-md text-left",
                  "data-[active]:bg-background data-[active]:shadow-xs",
                )}
              >
                <span className="text-primary shrink-0">{APP_ICONS[appId]}</span>
                <span className="text-xs font-medium truncate">{label}</span>
                <Badge variant="outline" className="text-[10px] px-1 py-0 ml-auto shrink-0">
                  {configuredCount}/{variables.length}
                </Badge>
              </TabsTrigger>
            );
          })}
        </TabsList>

        {/* Content panels */}
        <div className="flex-1 min-w-0">
          {appIds.map((appId) => {
            const { variables } = appVariables[appId];
            return (
              <TabsContent key={appId} value={appId} className="mt-0 border rounded-lg overflow-y-auto max-h-[400px]">
                <div className="divide-y divide-border/50">
                  {variables.map((v) => (
                    <EnvField
                      key={v.key}
                      variableKey={v.key}
                      description={v.description}
                      required={v.required}
                      placeholder={v.placeholder}
                      defaultValue={v.defaultValue}
                      url={v.url}
                      hint={v.hint}
                      value={values[v.key] ?? ""}
                      onChange={onChange}
                    />
                  ))}
                </div>
              </TabsContent>
            );
          })}
        </div>
      </Tabs>
    </div>
  );
}
