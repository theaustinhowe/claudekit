"use client";

import { AlertCircle, Bot, Check, ExternalLink, Sparkles, TestTube2, X } from "lucide-react";
import { Badge } from "@devkit/ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@devkit/ui/components/card";
import { Skeleton } from "@devkit/ui/components/skeleton";
import { useAgentStatus } from "@/hooks/use-agents";
import type { AgentInfo } from "@/lib/api";

interface ProviderStatusPanelProps {
  agent: AgentInfo;
}

const AgentIcon = ({ type }: { type: string }) => {
  const iconClass = "h-5 w-5";
  switch (type) {
    case "claude-code":
      return <Bot className={`${iconClass} text-orange-500`} />;
    case "openai-codex":
      return <Sparkles className={`${iconClass} text-emerald-500`} />;
    case "mock":
      return <TestTube2 className={`${iconClass} text-gray-500`} />;
    default:
      return <Bot className={`${iconClass} text-muted-foreground`} />;
  }
};

export function ProviderStatusPanel({ agent }: ProviderStatusPanelProps) {
  const { data: status, isLoading } = useAgentStatus(agent.type);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <Skeleton className="h-5 w-5 rounded" />
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-5 w-16 ml-auto" />
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const isReady = status?.available && status?.configured;
  const isPartiallyConfigured = status?.featureFlagEnabled && !status?.apiKeySet;
  const isDisabled = !status?.featureFlagEnabled && agent.type !== "mock";

  // Determine status badge
  const getStatusBadge = () => {
    if (agent.type === "mock") {
      return (
        <Badge variant="secondary" className="text-xs gap-1">
          <TestTube2 className="h-3 w-3" />
          Dev Only
        </Badge>
      );
    }
    if (isReady) {
      return (
        <Badge
          variant="secondary"
          className="text-xs gap-1 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
        >
          <Check className="h-3 w-3" />
          Ready
        </Badge>
      );
    }
    if (isPartiallyConfigured) {
      return (
        <Badge
          variant="secondary"
          className="text-xs gap-1 bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
        >
          <AlertCircle className="h-3 w-3" />
          Needs Config
        </Badge>
      );
    }
    return (
      <Badge variant="secondary" className="text-xs gap-1 text-muted-foreground">
        <X className="h-3 w-3" />
        Disabled
      </Badge>
    );
  };

  // Get configuration requirements
  const getConfigRequirements = () => {
    if (agent.type === "claude-code") {
      return [{ label: "Claude CLI installed", met: status?.configured ?? false }];
    }
    if (agent.type === "openai-codex") {
      return [
        {
          label: "Feature flag enabled (ENABLE_OPENAI_CODEX)",
          met: status?.featureFlagEnabled ?? false,
        },
        {
          label: "API key configured (OPENAI_API_KEY)",
          met: status?.apiKeySet ?? false,
        },
      ];
    }
    if (agent.type === "mock") {
      return [{ label: "Always available in development", met: true }];
    }
    return [];
  };

  const requirements = getConfigRequirements();

  // Get documentation link
  const getDocsLink = () => {
    if (agent.type === "openai-codex") {
      return "/docs/openai.md";
    }
    if (agent.type === "claude-code") {
      return "https://claude.ai/code";
    }
    return null;
  };

  const docsLink = getDocsLink();

  return (
    <Card className={isDisabled && agent.type !== "mock" ? "opacity-60" : undefined}>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <AgentIcon type={agent.type} />
          <CardTitle className="text-base flex-1">{agent.displayName}</CardTitle>
          {getStatusBadge()}
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {/* Status message */}
        {status?.message && <p className="text-sm text-muted-foreground">{status.message}</p>}

        {/* Configuration requirements */}
        {requirements.length > 0 && (
          <div className="space-y-1.5">
            {requirements.map((req) => (
              <div key={req.label} className="flex items-center gap-2 text-sm">
                {req.met ? (
                  <Check className="h-4 w-4 text-green-500 shrink-0" />
                ) : (
                  <X className="h-4 w-4 text-red-500 shrink-0" />
                )}
                <span className={req.met ? "text-foreground" : "text-muted-foreground"}>{req.label}</span>
              </div>
            ))}
          </div>
        )}

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

        {/* Documentation link */}
        {docsLink && !isReady && (
          <a
            href={docsLink}
            target={docsLink.startsWith("http") ? "_blank" : undefined}
            rel={docsLink.startsWith("http") ? "noopener noreferrer" : undefined}
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
