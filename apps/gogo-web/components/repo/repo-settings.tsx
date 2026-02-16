"use client";

import { Badge } from "@devkit/ui/components/badge";
import { Button } from "@devkit/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@devkit/ui/components/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@devkit/ui/components/collapsible";
import { Input } from "@devkit/ui/components/input";
import { Label } from "@devkit/ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@devkit/ui/components/select";
import { Slider } from "@devkit/ui/components/slider";
import { Switch } from "@devkit/ui/components/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@devkit/ui/components/tooltip";
import { AlertCircle, Bot, ChevronDown, GitBranch, Loader2, Shield, TestTube2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAgentStatus, useAgents } from "@/hooks/use-agents";
import { useRepositoryBranches, useRepositorySettings, useUpdateRepositorySettings } from "@/hooks/use-repositories";
import type { AgentInfo, RepositoryInfo } from "@/lib/api";

// Helper to get agent icon
const AgentIcon = ({ type, className }: { type: string; className?: string }) => {
  const iconClass = className ?? "h-4 w-4";
  switch (type) {
    case "claude-code":
      return <Bot className={`${iconClass} text-orange-500`} />;
    case "mock":
      return <TestTube2 className={`${iconClass} text-gray-500`} />;
    default:
      return <Bot className={`${iconClass} text-muted-foreground`} />;
  }
};

// Agent select option component
function AgentSelectOption({
  agent,
  isSelected,
  onSelect,
}: {
  agent: AgentInfo;
  isSelected: boolean;
  onSelect: (type: string) => void;
}) {
  const { data: status } = useAgentStatus(agent.type);

  const isAvailable = status?.available ?? false;
  const isConfigured = status?.configured ?? false;
  const isMock = agent.type === "mock";
  const isDisabled = !isAvailable && !isMock;
  const needsConfig = status?.featureFlagEnabled && !status?.apiKeySet;

  const getStatusHint = () => {
    if (isMock) return "(Dev Only)";
    if (needsConfig) return "Missing API key";
    if (!isConfigured) return "Not configured";
    return null;
  };

  const statusHint = getStatusHint();

  return (
    <button
      type="button"
      onClick={() => !isDisabled && onSelect(agent.type)}
      disabled={isDisabled}
      className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${
        isDisabled ? "opacity-50 cursor-not-allowed" : "hover:bg-accent cursor-pointer"
      } ${isSelected ? "bg-accent" : ""}`}
    >
      <AgentIcon type={agent.type} />
      <span className="flex-1">{agent.displayName}</span>
      {statusHint && <span className="text-xs text-muted-foreground">{statusHint}</span>}
      {needsConfig && <AlertCircle className="h-3 w-3 text-yellow-500" />}
    </button>
  );
}

interface RepoSettingsProps {
  repository: RepositoryInfo;
}

export function RepoSettings({ repository }: RepoSettingsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const { data: settings, isLoading } = useRepositorySettings(repository.id);
  const { data: branchData, isLoading: branchesLoading } = useRepositoryBranches(
    isOpen ? repository.id : null, // Only fetch when expanded
  );
  const { data: agents = [], isLoading: agentsLoading } = useAgents();
  const { mutate: updateSettings, isPending: isSaving } = useUpdateRepositorySettings();

  // Local state for editing
  const [pollIntervalMs, setPollIntervalMs] = useState<number>(30000);
  const [testCommand, setTestCommand] = useState<string>("");
  const [agentProvider, setAgentProvider] = useState<string>("claude-code");
  const [triggerLabel, setTriggerLabel] = useState<string>("agent");
  const [branchPattern, setBranchPattern] = useState<string>("agent/issue-{number}-{slug}");
  const [baseBranch, setBaseBranch] = useState<string>("main");
  const [autoCleanup, setAutoCleanup] = useState<boolean>(true);
  const [autoStartJobs, setAutoStartJobs] = useState<boolean>(true);
  const [autoCreatePr, setAutoCreatePr] = useState<boolean>(true);

  // Sync server settings to local state
  useEffect(() => {
    if (settings) {
      setPollIntervalMs(settings.pollIntervalMs ?? 30000);
      setTestCommand(settings.testCommand ?? "");
      setAgentProvider(settings.agentProvider ?? "claude-code");
      setTriggerLabel(settings.triggerLabel ?? "agent");
      setBranchPattern(settings.branchPattern ?? "agent/issue-{number}-{slug}");
      setBaseBranch(settings.baseBranch ?? "main");
      setAutoCleanup(settings.autoCleanup ?? true);
      setAutoStartJobs(settings.autoStartJobs ?? true);
      setAutoCreatePr(settings.autoCreatePr ?? true);
    }
  }, [settings]);

  const handleSave = () => {
    updateSettings(
      {
        repositoryId: repository.id,
        settings: {
          pollIntervalMs,
          testCommand: testCommand || null,
          agentProvider,
          triggerLabel,
          branchPattern,
          baseBranch,
          autoCleanup,
          autoStartJobs,
          autoCreatePr,
        },
      },
      {
        onSuccess: () => {
          toast.success("Settings Saved", {
            description: `Settings updated for ${repository.owner}/${repository.name}`,
          });
        },
        onError: (error) => {
          toast.error("Failed to save settings", {
            description: error.message,
          });
        },
      },
    );
  };

  const displayName = repository.displayName || `${repository.owner}/${repository.name}`;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-accent/50 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <GitBranch className="h-5 w-5 text-muted-foreground" />
                <div>
                  <CardTitle className="text-base">{displayName}</CardTitle>
                  <CardDescription className="text-xs">
                    {repository.owner}/{repository.name}
                  </CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {repository.isActive ? (
                  <span className="text-xs text-green-600 dark:text-green-400">Active</span>
                ) : (
                  <span className="text-xs text-muted-foreground">Inactive</span>
                )}
                <ChevronDown
                  className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
                />
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0 pb-4 space-y-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            ) : (
              <>
                {/* Trigger Label & Base Branch - side by side */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-sm">Trigger Label</Label>
                    <Input
                      placeholder="agent:run"
                      value={triggerLabel}
                      onChange={(e) => setTriggerLabel(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">Issues with this label trigger jobs</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm">Base Branch</Label>
                    <Select value={baseBranch} onValueChange={setBaseBranch}>
                      <SelectTrigger>
                        {branchesLoading ? (
                          <span className="flex items-center gap-2 text-muted-foreground">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Loading...
                          </span>
                        ) : (
                          <SelectValue placeholder="Select branch" />
                        )}
                      </SelectTrigger>
                      <SelectContent>
                        {branchData?.branches.map((branch) => (
                          <SelectItem key={branch.name} value={branch.name}>
                            <span className="flex items-center gap-2">
                              {branch.name}
                              {branch.isDefault && (
                                <Badge variant="secondary" className="text-xs px-1 py-0">
                                  default
                                </Badge>
                              )}
                              {branch.protected && <Shield className="h-3 w-3 text-muted-foreground" />}
                            </span>
                          </SelectItem>
                        ))}
                        {!branchesLoading && !branchData?.branches.length && (
                          <SelectItem value={baseBranch} disabled>
                            {baseBranch} (current)
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">Branch to create worktrees from</p>
                  </div>
                </div>

                {/* Branch Pattern */}
                <div className="space-y-2">
                  <Label className="text-sm">Branch Pattern</Label>
                  <Input
                    placeholder="agent/issue-{number}-{slug}"
                    value={branchPattern}
                    onChange={(e) => setBranchPattern(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Use {"{number}"} and {"{slug}"} for issue number and title
                  </p>
                </div>

                {/* Poll Interval */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">Poll Interval</Label>
                    <span className="text-sm text-muted-foreground">{Math.round(pollIntervalMs / 1000)}s</span>
                  </div>
                  <Slider
                    value={[pollIntervalMs]}
                    onValueChange={([value]) => setPollIntervalMs(value)}
                    min={5000}
                    max={300000}
                    step={5000}
                  />
                </div>

                {/* Test Command */}
                <div className="space-y-2">
                  <Label className="text-sm">Test Command</Label>
                  <Input placeholder="npm test" value={testCommand} onChange={(e) => setTestCommand(e.target.value)} />
                </div>

                {/* Agent Provider */}
                <div className="space-y-2">
                  <Label className="text-sm">Default Agent</Label>
                  <AgentProviderSelect
                    agents={agents}
                    value={agentProvider}
                    onChange={setAgentProvider}
                    isLoading={agentsLoading}
                    open={dropdownOpen}
                    onOpenChange={setDropdownOpen}
                  />
                </div>

                {/* Automation Settings */}
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Automation</Label>

                  {/* Auto Start Jobs */}
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <Label className="text-sm">Auto Start Jobs</Label>
                      <p className="text-xs text-muted-foreground">Automatically start queued jobs</p>
                    </div>
                    <Switch checked={autoStartJobs} onCheckedChange={setAutoStartJobs} />
                  </div>

                  {/* Auto Create PR */}
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <Label className="text-sm">Auto Create PR</Label>
                      <p className="text-xs text-muted-foreground">Automatically create PR when agent completes</p>
                    </div>
                    <Switch checked={autoCreatePr} onCheckedChange={setAutoCreatePr} />
                  </div>

                  {/* Auto Cleanup */}
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <Label className="text-sm">Auto Cleanup</Label>
                      <p className="text-xs text-muted-foreground">Delete worktree after PR is merged</p>
                    </div>
                    <Switch checked={autoCleanup} onCheckedChange={setAutoCleanup} />
                  </div>
                </div>

                {/* Save Button */}
                <div className="flex justify-end pt-2">
                  <Button size="sm" onClick={handleSave} disabled={isSaving}>
                    {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {isSaving ? "Saving..." : "Save Settings"}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

// Agent provider select dropdown component
function AgentProviderSelect({
  agents,
  value,
  onChange,
  isLoading,
  open,
  onOpenChange,
}: {
  agents: AgentInfo[];
  value: string;
  onChange: (type: string) => void;
  isLoading: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const selectedAgent = agents.find((a) => a.type === value);
  const { data: selectedStatus } = useAgentStatus(value);

  // Check if selected agent has issues
  const hasWarning = selectedStatus?.featureFlagEnabled && !selectedStatus?.apiKeySet;

  if (isLoading) {
    return (
      <div className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-muted-foreground">Loading agents...</span>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="relative">
        <button
          type="button"
          onClick={() => onOpenChange(!open)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm flex items-center gap-2 hover:bg-accent/50 transition-colors"
        >
          {selectedAgent ? (
            <>
              <AgentIcon type={selectedAgent.type} />
              <span className="flex-1 text-left">{selectedAgent.displayName}</span>
              {hasWarning && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <AlertCircle className="h-4 w-4 text-yellow-500" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Missing API key configuration</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </>
          ) : (
            <span className="flex-1 text-left text-muted-foreground">Select an agent...</span>
          )}
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        </button>

        {open && (
          <div className="absolute z-50 mt-1 w-full rounded-md border border-input bg-background shadow-lg">
            {agents.map((agent) => (
              <AgentSelectOption
                key={agent.type}
                agent={agent}
                isSelected={agent.type === value}
                onSelect={(type) => {
                  onChange(type);
                  onOpenChange(false);
                }}
              />
            ))}
            {agents.length === 0 && <div className="px-3 py-2 text-sm text-muted-foreground">No agents available</div>}
          </div>
        )}

        {/* Status hint below dropdown */}
        {selectedStatus && !selectedStatus.available && value !== "mock" && (
          <p className="mt-1.5 text-xs text-yellow-600 dark:text-yellow-400 flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            {selectedStatus.message}
          </p>
        )}
      </div>
    </TooltipProvider>
  );
}
