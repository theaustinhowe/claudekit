"use client";

import { AlertCircle, Bot, Check, ExternalLink, Info, Sparkles, X } from "lucide-react";
import { Badge } from "@devkit/ui/components/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@devkit/ui/components/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@devkit/ui/components/collapsible";
import { Skeleton } from "@devkit/ui/components/skeleton";
import { useAllAgents } from "@/hooks/use-agents";
import type { KnownAgentInfo } from "@/lib/api";

const AgentIcon = ({ type }: { type: string }) => {
  const iconClass = "h-5 w-5";
  switch (type) {
    case "claude-code":
      return <Bot className={`${iconClass} text-orange-500`} />;
    case "openai-codex":
      return <Sparkles className={`${iconClass} text-emerald-500`} />;
    default:
      return <Bot className={`${iconClass} text-muted-foreground`} />;
  }
};

function ConfiguredAgentCard({ agent }: { agent: KnownAgentInfo }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <AgentIcon type={agent.type} />
          <CardTitle className="text-base flex-1">{agent.displayName}</CardTitle>
          <Badge
            variant="secondary"
            className="text-xs gap-1 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
          >
            <Check className="h-3 w-3" />
            Ready
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        <p className="text-sm text-muted-foreground">{agent.description}</p>

        {/* Capabilities */}
        <div className="flex flex-wrap gap-2 pt-1">
          {agent.capabilities.canResume && (
            <Badge variant="outline" className="text-xs">
              Pause/Resume
            </Badge>
          )}
          {agent.capabilities.canInject && (
            <Badge variant="outline" className="text-xs">
              Message Injection
            </Badge>
          )}
          {agent.capabilities.supportsStreaming && (
            <Badge variant="outline" className="text-xs">
              Streaming Logs
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function AvailableAgentCard({ agent }: { agent: KnownAgentInfo }) {
  const isPartiallyConfigured = agent.status.details && Object.values(agent.status.details).some((v) => v === true);

  return (
    <Card className="opacity-80">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <AgentIcon type={agent.type} />
          <CardTitle className="text-base flex-1">{agent.displayName}</CardTitle>
          {isPartiallyConfigured ? (
            <Badge
              variant="secondary"
              className="text-xs gap-1 bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
            >
              <AlertCircle className="h-3 w-3" />
              Needs Config
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-xs gap-1 text-muted-foreground">
              <X className="h-3 w-3" />
              Not Configured
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        <p className="text-sm text-muted-foreground">{agent.description}</p>

        {/* Configuration status */}
        {agent.status.details && (
          <div className="space-y-1.5">
            {Object.entries(agent.status.details).map(([key, value]) => (
              <div key={key} className="flex items-center gap-2 text-sm">
                {value ? (
                  <Check className="h-4 w-4 text-green-500 shrink-0" />
                ) : (
                  <X className="h-4 w-4 text-red-500 shrink-0" />
                )}
                <span className={value ? "text-foreground" : "text-muted-foreground"}>{formatConfigKey(key)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Environment variables section */}
        {agent.envVars.length > 0 && (
          <Collapsible>
            <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium text-primary hover:underline">
              <Info className="h-4 w-4" />
              Environment Variables
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <div className="rounded-md bg-muted p-3 space-y-2">
                {agent.envVars.map((envVar) => (
                  <div key={envVar.name} className="text-sm">
                    <code className="font-mono text-xs bg-background px-1.5 py-0.5 rounded">{envVar.name}</code>
                    {envVar.required && <span className="text-red-500 ml-1">*</span>}
                    <p className="text-muted-foreground text-xs mt-0.5">{envVar.description}</p>
                  </div>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Installation instructions */}
        <div className="rounded-md border border-dashed p-3">
          <p className="text-sm text-muted-foreground">{agent.installInstructions}</p>
        </div>

        {/* Documentation link */}
        {agent.docsUrl && (
          <a
            href={agent.docsUrl}
            target={agent.docsUrl.startsWith("http") ? "_blank" : undefined}
            rel={agent.docsUrl.startsWith("http") ? "noopener noreferrer" : undefined}
            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
          >
            <ExternalLink className="h-3 w-3" />
            Setup documentation
          </a>
        )}
      </CardContent>
    </Card>
  );
}

function formatConfigKey(key: string): string {
  // Convert camelCase to readable format
  const formatted = key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (str) => str.toUpperCase())
    .trim();

  // Special cases
  const specialCases: Record<string, string> = {
    "Cli Installed": "CLI installed",
    "Api Key Set": "API key configured",
    "Feature Flag Enabled": "Feature flag enabled",
    "Settings Enabled": "Settings enabled",
  };

  return specialCases[formatted] || formatted;
}

export function AgentsSettings() {
  const { data: agents = [], isLoading } = useAllAgents();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const configuredAgents = agents.filter((a) => a.status.configured);
  const availableAgents = agents.filter((a) => !a.status.configured);

  return (
    <div className="space-y-6">
      {/* Configured Agents */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            <CardTitle>Agent Providers</CardTitle>
          </div>
          <CardDescription>AI agents available for running jobs on your repositories.</CardDescription>
        </CardHeader>
      </Card>

      {configuredAgents.length > 0 ? (
        <div className="space-y-3">
          {configuredAgents.map((agent) => (
            <ConfiguredAgentCard key={agent.type} agent={agent} />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">No agents are configured yet. Set up an agent below to get started.</p>
          </CardContent>
        </Card>
      )}

      {/* Available (Unconfigured) Agents */}
      {availableAgents.length > 0 && (
        <div className="space-y-3">
          {availableAgents.map((agent) => (
            <AvailableAgentCard key={agent.type} agent={agent} />
          ))}
        </div>
      )}
    </div>
  );
}
