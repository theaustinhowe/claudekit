"use client";

import { cn } from "@claudekit/ui";
import { Badge } from "@claudekit/ui/components/badge";
import { Button } from "@claudekit/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@claudekit/ui/components/card";
import { Checkbox } from "@claudekit/ui/components/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@claudekit/ui/components/collapsible";
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
import { Popover, PopoverContent, PopoverTrigger } from "@claudekit/ui/components/popover";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@claudekit/ui/components/sheet";
import { Skeleton } from "@claudekit/ui/components/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@claudekit/ui/components/tooltip";
import {
  AlertCircle,
  ArrowRight,
  ArrowUpCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  Hammer,
  Loader2,
  RefreshCw,
  Settings2,
  Terminal,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_TOOLS, TOOL_CATEGORY_LABELS } from "@/lib/constants/tools";
import type { ToolCategory, ToolCheckResult, ToolDefinition } from "@/lib/types/toolbox";

interface ToolboxDialogProps {
  trigger: React.ReactNode;
  initialToolIds: string[];
}

const CATEGORY_ORDER: ToolCategory[] = ["ai-tool", "package-manager", "runtime", "dev-tool", "vcs"];

export function ToolboxDialog({ trigger, initialToolIds }: ToolboxDialogProps) {
  const [open, setOpen] = useState(false);
  const [toolIds, setToolIds] = useState<string[]>(initialToolIds);
  const [results, setResults] = useState<Map<string, ToolCheckResult>>(new Map());
  const [checking, setChecking] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [manageSelection, setManageSelection] = useState<string[]>(initialToolIds);
  const hasCheckedRef = useRef(false);

  // Command execution state
  const [cmdSheetOpen, setCmdSheetOpen] = useState(false);
  const [cmdOutput, setCmdOutput] = useState<string[]>([]);
  const [cmdRunning, setCmdRunning] = useState(false);
  const [cmdExitCode, setCmdExitCode] = useState<number | null>(null);
  const [cmdToolName, setCmdToolName] = useState("");
  const [cmdAction, setCmdAction] = useState<"install" | "update">("install");
  const cmdEndRef = useRef<HTMLDivElement>(null);
  const runningToolIdRef = useRef<string | null>(null);

  const tools = toolIds.map((id) => DEFAULT_TOOLS.find((t) => t.id === id)).filter(Boolean) as ToolDefinition[];

  const runChecks = useCallback(
    async (ids?: string[]) => {
      const checkIds = ids ?? toolIds;
      if (checkIds.length === 0) return;
      setChecking(true);
      try {
        const res = await fetch("/api/toolbox/check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ toolIds: checkIds }),
        });
        if (res.ok) {
          const data = await res.json();
          setResults((prev) => {
            const next = new Map(prev);
            for (const r of data.results as ToolCheckResult[]) {
              next.set(r.toolId, r);
            }
            return next;
          });
        }
      } catch {
        // Silently fail
      } finally {
        setChecking(false);
      }
    },
    [toolIds],
  );

  // Run checks when dialog opens for the first time
  useEffect(() => {
    if (open && !hasCheckedRef.current) {
      hasCheckedRef.current = true;
      runChecks();
    }
  }, [open, runChecks]);

  // Scroll to bottom as output streams in
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally re-run on cmdOutput changes to auto-scroll
  useEffect(() => {
    cmdEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [cmdOutput.length]);

  const handleRunCommand = useCallback(
    async (tool: ToolDefinition, action: "install" | "update", installMethod?: string | null) => {
      setCmdOutput([]);
      setCmdExitCode(null);
      setCmdRunning(true);
      setCmdToolName(tool.name);
      setCmdAction(action);
      setCmdSheetOpen(true);
      runningToolIdRef.current = tool.id;

      try {
        const res = await fetch("/api/toolbox/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ toolId: tool.id, action, installMethod }),
        });

        if (!res.ok || !res.body) {
          const err = res.ok ? "No response body" : ((await res.json().catch(() => ({}))).error ?? "Request failed");
          setCmdOutput((prev) => [...prev, `Error: ${err}\n`]);
          setCmdRunning(false);
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data: ")) continue;
            const payload = trimmed.slice(6);

            try {
              const event = JSON.parse(payload);
              if (event.type === "output" && event.data) {
                setCmdOutput((prev) => [...prev, event.data]);
              } else if (event.type === "done") {
                setCmdExitCode(typeof event.exitCode === "number" ? event.exitCode : 0);
              } else if (event.type === "error") {
                setCmdOutput((prev) => [...prev, `Error: ${event.data}\n`]);
              }
            } catch {
              // skip unparseable
            }
          }
        }
      } catch (err) {
        setCmdOutput((prev) => [...prev, `Network error: ${(err as Error).message}\n`]);
      } finally {
        setCmdRunning(false);
        if (runningToolIdRef.current) {
          runChecks([runningToolIdRef.current]);
          runningToolIdRef.current = null;
        }
      }
    },
    [runChecks],
  );

  // Stats
  const checked = tools.filter((t) => results.has(t.id));
  const installed = checked.filter((t) => results.get(t.id)?.installed);
  const missing = checked.filter((t) => !results.get(t.id)?.installed && !results.get(t.id)?.error);
  const withErrors = checked.filter((t) => results.get(t.id)?.error);
  const withUpdates = checked.filter((t) => results.get(t.id)?.updateAvailable);

  // Group tools by category
  const grouped = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    label: TOOL_CATEGORY_LABELS[cat],
    tools: tools.filter((t) => t.category === cat),
  })).filter((g) => g.tools.length > 0);

  async function handleSaveTools() {
    setToolIds(manageSelection);
    // Persist to server
    await fetch("/api/toolbox/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toolIds: manageSelection }),
    });
    setManageOpen(false);
    // Clear old results for removed tools
    setResults((prev) => {
      const next = new Map<string, ToolCheckResult>();
      for (const [id, r] of prev) {
        if (manageSelection.includes(id)) next.set(id, r);
      }
      return next;
    });
    // Check any newly added tools
    const newIds = manageSelection.filter((id) => !toolIds.includes(id));
    if (newIds.length > 0) {
      runChecks(manageSelection);
    }
  }

  return (
    <TooltipProvider>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>{trigger}</DialogTrigger>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Hammer className="w-5 h-5" />
              Toolbox
            </DialogTitle>
            <DialogDescription>Check and manage your developer tools.</DialogDescription>
          </DialogHeader>
          <DialogBody className="flex-1 overflow-y-auto">
            {/* Summary row */}
            <div className="flex items-center gap-4 mb-4 text-sm">
              <span className="text-muted-foreground">{tools.length} tools</span>
              {results.size > 0 && (
                <>
                  <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {installed.length} installed
                  </span>
                  {withUpdates.length > 0 && (
                    <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
                      <ArrowUpCircle className="w-3.5 h-3.5" />
                      {withUpdates.length} updates
                    </span>
                  )}
                  {missing.length > 0 && (
                    <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
                      <XCircle className="w-3.5 h-3.5" />
                      {missing.length} missing
                    </span>
                  )}
                  {withErrors.length > 0 && (
                    <span className="flex items-center gap-1 text-yellow-600 dark:text-yellow-400">
                      <AlertCircle className="w-3.5 h-3.5" />
                      {withErrors.length} errors
                    </span>
                  )}
                </>
              )}
              <div className="flex-1" />
              <Button variant="outline" size="sm" className="h-7" onClick={() => setManageOpen(true)}>
                <Settings2 className="w-3.5 h-3.5 mr-1" />
                Manage
              </Button>
              <Button size="sm" className="h-7" onClick={() => runChecks()} disabled={checking}>
                {checking ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5 mr-1" />
                )}
                Check All
              </Button>
            </div>

            {/* Tool Groups */}
            <div className="space-y-4">
              {grouped.map((group) => (
                <Card key={group.category}>
                  <CardHeader className="pb-2 py-3">
                    <CardTitle className="text-sm">{group.label}</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="divide-y divide-border">
                      {group.tools.map((tool) => (
                        <ToolRow
                          key={tool.id}
                          tool={tool}
                          result={results.get(tool.id)}
                          checking={checking}
                          onRunCommand={handleRunCommand}
                        />
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </DialogBody>
        </DialogContent>
      </Dialog>

      {/* Manage Tools Dialog */}
      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Manage Tools</DialogTitle>
            <DialogDescription>Choose which developer tools to track in your Toolbox.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div className="max-h-80 overflow-y-auto space-y-4 py-2">
              {CATEGORY_ORDER.map((cat) => {
                const catTools = DEFAULT_TOOLS.filter((t) => t.category === cat);
                if (catTools.length === 0) return null;
                return (
                  <div key={cat}>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                      {TOOL_CATEGORY_LABELS[cat]}
                    </p>
                    <div className="space-y-2">
                      {catTools.map((tool) => {
                        const toolChecked = manageSelection.includes(tool.id);
                        return (
                          <div key={tool.id} className="flex items-center gap-3">
                            <Checkbox
                              id={`tool-${tool.id}`}
                              checked={toolChecked}
                              onCheckedChange={(checked) => {
                                setManageSelection((prev) =>
                                  checked ? [...prev, tool.id] : prev.filter((id) => id !== tool.id),
                                );
                              }}
                            />
                            <label htmlFor={`tool-${tool.id}`} className="cursor-pointer">
                              <span className="text-sm font-medium">{tool.name}</span>
                              <span className="text-xs text-muted-foreground ml-2">{tool.description}</span>
                            </label>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManageOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveTools} disabled={manageSelection.length === 0}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Command Output Sheet */}
      <Sheet open={cmdSheetOpen} onOpenChange={setCmdSheetOpen}>
        <SheetContent className="sm:max-w-lg flex flex-col">
          <SheetHeader>
            <SheetTitle>
              {cmdAction === "install" ? "Installing" : "Updating"} {cmdToolName}
            </SheetTitle>
            <SheetDescription>
              {cmdRunning ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Running...
                </span>
              ) : cmdExitCode === 0 ? (
                <span className="flex items-center gap-2 text-green-600 dark:text-green-400">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Completed successfully
                </span>
              ) : cmdExitCode !== null ? (
                <span className="flex items-center gap-2 text-destructive">
                  <XCircle className="w-3.5 h-3.5" />
                  Exited with code {cmdExitCode}
                </span>
              ) : null}
            </SheetDescription>
          </SheetHeader>
          <SheetBody>
            <div className="flex-1 mt-4 bg-zinc-950 rounded-lg p-4 overflow-y-auto font-mono text-xs text-zinc-200 whitespace-pre-wrap">
              {cmdOutput.join("")}
              <div ref={cmdEndRef} />
            </div>
          </SheetBody>
        </SheetContent>
      </Sheet>
    </TooltipProvider>
  );
}

function ToolRow({
  tool,
  result,
  checking,
  onRunCommand,
}: {
  tool: ToolDefinition;
  result: ToolCheckResult | undefined;
  checking: boolean;
  onRunCommand: (tool: ToolDefinition, action: "install" | "update", installMethod?: string | null) => void;
}) {
  const [hoverOpen, setHoverOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);

  if (!result && checking) {
    return (
      <div className="flex items-center gap-3 px-4 py-2.5">
        <Skeleton className="w-4 h-4 rounded" />
        <Skeleton className="w-5 h-5 rounded" />
        <Skeleton className="h-4 w-24" />
        <div className="flex-1" />
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-4 w-20 hidden sm:block" />
      </div>
    );
  }

  const isInstalled = result?.installed ?? false;
  const hasError = !!result?.error;
  const isHomebrew = result?.metadata?.installMethod === "homebrew";
  const updateCommand = isHomebrew ? `brew upgrade ${tool.binary}` : (tool.updateCommand ?? tool.installCommand);
  const expandCommand = updateCommand ?? tool.installCommand ?? null;

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <div className="flex items-center gap-3 px-4 py-2.5">
        {/* Expand chevron */}
        <CollapsibleTrigger asChild>
          <button type="button" className="shrink-0 p-0.5 rounded hover:bg-muted transition-colors">
            <ChevronDown
              className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform", expanded && "rotate-180")}
            />
          </button>
        </CollapsibleTrigger>

        {/* Status icon */}
        <div className="shrink-0">
          {!result ? (
            <div className="w-4 h-4 rounded-full bg-muted" />
          ) : isInstalled ? (
            <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
          ) : hasError ? (
            <Tooltip>
              <TooltipTrigger>
                <AlertCircle className="w-4 h-4 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent>{result.error}</TooltipContent>
            </Tooltip>
          ) : (
            <XCircle className="w-4 h-4 text-red-500 dark:text-red-400" />
          )}
        </div>

        {/* Name + description */}
        <CollapsibleTrigger asChild>
          <div className="flex-1 min-w-0 cursor-pointer">
            <p className="text-sm font-medium truncate">{tool.name}</p>
            <p className="text-xs text-muted-foreground truncate hidden sm:block">{tool.description}</p>
          </div>
        </CollapsibleTrigger>

        {/* Action (upgrade/install) */}
        <div className="shrink-0">
          {result && isInstalled && result.updateAvailable && updateCommand && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                onRunCommand(tool, "update", result?.metadata?.installMethod);
              }}
            >
              <ArrowUpCircle className="w-3.5 h-3.5 mr-1" />
              Upgrade
            </Button>
          )}
          {result &&
            !isInstalled &&
            (tool.installCommand ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  onRunCommand(tool, "install", result?.metadata?.installMethod);
                }}
              >
                <Terminal className="w-3.5 h-3.5 mr-1" />
                Install
              </Button>
            ) : (
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" asChild>
                <a href={tool.installUrl} target="_blank" rel="noopener noreferrer">
                  Install
                  <ExternalLink className="w-3 h-3 ml-1" />
                </a>
              </Button>
            ))}
        </div>

        {/* Status badge */}
        <div className="shrink-0">
          {!result ? (
            <Badge variant="outline" className="text-muted-foreground">
              Pending
            </Badge>
          ) : isInstalled ? (
            result.updateAvailable ? (
              <Popover open={hoverOpen} onOpenChange={setHoverOpen}>
                <PopoverTrigger onMouseEnter={() => setHoverOpen(true)} onMouseLeave={() => setHoverOpen(false)}>
                  <Badge className="bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/20 cursor-default">
                    <ArrowUpCircle className="w-3 h-3 mr-1" />
                    Update
                  </Badge>
                </PopoverTrigger>
                <PopoverContent
                  className="w-72 p-3"
                  align="center"
                  onMouseEnter={() => setHoverOpen(true)}
                  onMouseLeave={() => setHoverOpen(false)}
                >
                  <p className="text-sm font-medium mb-2">Update Available</p>
                  <div className="flex items-center gap-2 text-sm mb-2">
                    <span className="font-mono text-muted-foreground">{result.currentVersion}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="font-mono text-yellow-600 dark:text-yellow-400 font-medium">
                      {result.latestVersion}
                    </span>
                  </div>
                  {updateCommand && (
                    <code className="block text-xs bg-muted px-2 py-1.5 rounded font-mono text-muted-foreground truncate">
                      {updateCommand}
                    </code>
                  )}
                </PopoverContent>
              </Popover>
            ) : (
              <Badge className="bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/20">
                Installed
              </Badge>
            )
          ) : hasError ? (
            <Tooltip>
              <TooltipTrigger>
                <Badge className="bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/20">
                  <AlertCircle className="w-3 h-3 mr-1" />
                  Check Failed
                </Badge>
              </TooltipTrigger>
              <TooltipContent>{result?.error}</TooltipContent>
            </Tooltip>
          ) : (
            <Badge variant="destructive">Missing</Badge>
          )}
        </div>

        {/* Version */}
        <div className="shrink-0 w-24 text-right hidden sm:block">
          {result?.currentVersion ? (
            <span className="text-xs font-mono text-muted-foreground">{result.currentVersion}</span>
          ) : null}
        </div>
      </div>

      <CollapsibleContent>
        <div className="px-4 pb-2.5 pl-12 space-y-2">
          {expandCommand ? (
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-muted px-3 py-1.5 rounded-md font-mono text-muted-foreground">
                $ {expandCommand}
              </code>
            </div>
          ) : tool.installUrl ? (
            <a
              href={tool.installUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {tool.installUrl}
              <ExternalLink className="w-3 h-3" />
            </a>
          ) : (
            <p className="text-xs text-muted-foreground">No install command available</p>
          )}
          {result?.metadata && Object.keys(result.metadata).length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {result.metadata.installMethod && (
                <Badge variant="outline" className="text-[10px]">
                  {result.metadata.installMethod}
                </Badge>
              )}
              {result.metadata.authMethod && (
                <Badge variant="outline" className="text-[10px]">
                  {result.metadata.authMethod === "oauth"
                    ? "OAuth"
                    : result.metadata.authMethod === "api-key"
                      ? "API Key"
                      : result.metadata.authMethod}
                </Badge>
              )}
              {result.metadata.planType && (
                <Badge variant="outline" className="text-[10px]">
                  {result.metadata.planType}
                </Badge>
              )}
              {result.metadata.binaryPath && (
                <span className="text-[10px] font-mono text-muted-foreground">{result.metadata.binaryPath}</span>
              )}
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
