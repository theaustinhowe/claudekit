"use client";

import { useSessionStream } from "@claudekit/hooks";
import { cn } from "@claudekit/ui";
import { Badge } from "@claudekit/ui/components/badge";
import { Button } from "@claudekit/ui/components/button";
import { Card, CardContent } from "@claudekit/ui/components/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@claudekit/ui/components/collapsible";
import { Input } from "@claudekit/ui/components/input";
import { Progress } from "@claudekit/ui/components/progress";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@claudekit/ui/components/sheet";
import { Slider } from "@claudekit/ui/components/slider";
import type { StreamEntry } from "@claudekit/ui/components/streaming-display";
import { parseStreamLog, resetStreamIdCounter, StreamingDisplay } from "@claudekit/ui/components/streaming-display";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@claudekit/ui/components/tooltip";
import {
  ArrowDown,
  ArrowDownAZ,
  ArrowUpAZ,
  ClipboardCopy,
  ExternalLink,
  Filter,
  GitBranch,
  Scissors,
  Search,
  Square,
} from "lucide-react";
import { motion } from "motion/react";
import { parseAsString, useQueryState } from "nuqs";
import { useCallback, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { DiffPreviewDrawer } from "@/components/splitter/diff-preview-drawer";
import { SubPRCard } from "@/components/splitter/sub-pr-card";
import { useRepoContext } from "@/contexts/repo-context";
import { usePRFilters } from "@/hooks/use-pr-filters";
import { getSplitPlan, startSplitAnalysis, updateSubPRDescription } from "@/lib/actions/splitter";
import { SIZE_CLASSES, SUB_PR_COLORS } from "@/lib/constants";
import { exportSplitPlanToMarkdown } from "@/lib/export";
import type { PRSortField, PRWithComments, SplitExecution, SubPR } from "@/lib/types";

type Phase = "select" | "analyzing" | "results";

const sortOptions: { value: PRSortField; label: string }[] = [
  { value: "created", label: "Created" },
  { value: "updated", label: "Updated" },
  { value: "size", label: "Size" },
  { value: "comments", label: "Comments" },
  { value: "title", label: "A\u2013Z" },
];

const stateOptions: { value: "all" | "open" | "closed"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
];

const sizeOptions: { value: "all" | "S" | "M" | "L" | "XL"; label: string }[] = [
  { value: "all", label: "Any size" },
  { value: "S", label: "S" },
  { value: "M", label: "M" },
  { value: "L", label: "L" },
  { value: "XL", label: "XL" },
];

interface SplitterClientProps {
  repoId: string | null;
  largePRs: PRWithComments[];
}

export function SplitterClient({ repoId: _repoId, largePRs }: SplitterClientProps) {
  const { selectedRepoId } = useRepoContext();
  const [selectedPR, setSelectedPR] = useQueryState("pr", parseAsString);

  const repoPRs = selectedRepoId === "all" ? largePRs : largePRs.filter((p) => p.repoId === selectedRepoId);
  const {
    filters: prFilters,
    filtered: hookFiltered,
    setSearch,
    setState: setPRState,
    setSize,
    setSortField,
    toggleDirection,
  } = usePRFilters(repoPRs, { defaultSortField: "size", defaultSortDirection: "desc" });

  const [minComments, setMinComments] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const filteredPRs = useMemo(
    () => hookFiltered.filter((pr) => pr.commentCount >= minComments),
    [hookFiltered, minComments],
  );

  const hasActiveFilters = prFilters.state !== "all" || prFilters.size !== "all" || minComments > 1;

  const [phase, setPhase] = useState<Phase>("select");
  const [planId, setPlanId] = useState<string | null>(null);
  const [plan, setPlan] = useState<{ prNumber: number; prTitle: string; totalLines: number; subPRs: SubPR[] } | null>(
    null,
  );
  const [_isPending, startTransition] = useTransition();
  const [selectedFile, setSelectedFile] = useState<{ path: string; subPRTitle: string } | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executions, setExecutions] = useState<SplitExecution[]>([]);

  const handleSessionComplete = useCallback((event: { type: string; data?: Record<string, unknown> }) => {
    if (event.type === "done") {
      const resultPlanId = (event.data as { planId?: string })?.planId;
      if (resultPlanId) {
        setPlanId(resultPlanId);
        startTransition(async () => {
          const result = await getSplitPlan(resultPlanId);
          if (result) {
            setPlan({
              prNumber: result.prNumber,
              prTitle: result.prTitle,
              totalLines: result.total_lines,
              subPRs: result.subPRs,
            });
            setPhase("results");
            toast.success("Split plan ready", {
              description: `Generated ${result.subPRs.length} sub-PRs`,
            });
          } else {
            toast.error("No split plan generated");
            setPhase("select");
          }
        });
      } else {
        setPhase("select");
      }
    } else if (event.type === "error") {
      toast.error("Split analysis failed", { description: event.data?.message as string });
      setPhase("select");
    } else if (event.type === "cancelled") {
      toast.info("Analysis cancelled");
      setPhase("select");
    }
    setSessionId(null);
  }, []);

  const stream = useSessionStream({
    sessionId,
    onComplete: handleSessionComplete,
  });

  const streamEntries = useMemo(() => {
    resetStreamIdCounter();
    const result: StreamEntry[] = [];
    for (const entry of stream.logs) {
      result.push(...parseStreamLog(entry.log, entry.logType));
    }
    return result;
  }, [stream.logs]);

  const isStreaming = stream.status === "streaming";

  const handleSelect = (pr: PRWithComments) => {
    setSelectedPR(pr.id);
  };

  const handleAnalyze = () => {
    if (!selectedPR) return;
    setPhase("analyzing");
    startTransition(async () => {
      try {
        const id = await startSplitAnalysis(selectedPR);
        setSessionId(id);
      } catch (err) {
        toast.error("Failed to start analysis", {
          description: err instanceof Error ? err.message : "Unknown error",
        });
        setPhase("select");
      }
    });
  };

  const handleExecuteSplit = () => {
    if (!planId) return;
    setIsExecuting(true);
    startTransition(async () => {
      try {
        const { startSplitExecution } = await import("@/lib/actions/splitter");
        await startSplitExecution(planId);
        // Poll for execution status
        const { getSplitExecutionStatus } = await import("@/lib/actions/splitter");
        const status = await getSplitExecutionStatus(planId);
        setExecutions(status);
        setIsExecuting(false);
        toast.success("Split execution complete");
      } catch (err) {
        setIsExecuting(false);
        toast.error("Split execution failed", {
          description: err instanceof Error ? err.message : "Unknown error",
        });
      }
    });
  };

  if (phase === "analyzing") {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        <Scissors className="h-12 w-12 text-primary mb-6 animate-pulse" />
        <h2 className="text-xl font-bold mb-2">Analyzing PR</h2>
        <div className="w-full max-w-md space-y-4">
          <Progress value={stream.progress ?? 0} className="h-2" />
          {stream.phase && <p className="text-center text-sm font-medium">{stream.phase}</p>}
          {streamEntries.length > 0 && (
            <div className="max-h-[50vh] overflow-y-auto">
              <StreamingDisplay entries={streamEntries} variant="chat" live={isStreaming} />
            </div>
          )}
          {stream.elapsed > 0 && <p className="text-center text-xs text-muted-foreground">{stream.elapsed}s elapsed</p>}
        </div>
        <Button variant="outline" className="w-full max-w-md" onClick={stream.cancel}>
          <Square className="h-3 w-3 mr-2" />
          Cancel
        </Button>
      </div>
    );
  }

  if (phase === "results" && plan) {
    return (
      <>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold mb-1">Split Plan</h1>
            <p className="text-sm text-muted-foreground">
              #{plan.prNumber} &mdash; {plan.prTitle}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                const md = exportSplitPlanToMarkdown(plan);
                navigator.clipboard.writeText(md);
                toast.success("Copied to clipboard");
              }}
            >
              <ClipboardCopy className="h-4 w-4 mr-2" />
              Copy as Markdown
            </Button>
            <Button
              className="gradient-primary text-primary-foreground"
              onClick={handleExecuteSplit}
              disabled={isExecuting}
            >
              <GitBranch className="h-4 w-4 mr-2" />
              {isExecuting ? "Executing..." : "Execute Split"}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setPhase("select");
                setSelectedPR(null);
                setPlan(null);
              }}
            >
              Analyze Another
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className="p-4 pb-8">
            <p className="text-xs text-muted-foreground mb-2">
              Line distribution across {plan.subPRs.length} sub-PRs ({plan.totalLines} total lines)
            </p>
            <div className="flex h-6 rounded-lg overflow-hidden relative">
              {plan.subPRs.map((sp: SubPR, i: number) => (
                <div
                  key={sp.id ?? i}
                  className="h-full transition-all hover:opacity-80 cursor-pointer relative group"
                  style={{
                    width: `${(sp.linesChanged / Math.max(plan.totalLines, 1)) * 100}%`,
                    backgroundColor: SUB_PR_COLORS[i % SUB_PR_COLORS.length],
                  }}
                  title={`${sp.title}: ${sp.linesChanged} lines`}
                >
                  <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] font-mono text-muted-foreground opacity-0 group-hover:opacity-100 whitespace-nowrap">
                    {sp.linesChanged}L
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-3">
          {plan.subPRs.map((sp: SubPR, i: number) => (
            <motion.div
              key={sp.id ?? i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.12 }}
            >
              {i > 0 && (
                <div className="flex justify-center py-1">
                  <ArrowDown className="h-4 w-4 text-muted-foreground" />
                </div>
              )}
              <SubPRCard
                subPR={sp}
                color={SUB_PR_COLORS[i % SUB_PR_COLORS.length]}
                onFileClick={(path) => setSelectedFile({ path, subPRTitle: sp.title })}
                onDescriptionChange={(desc) => {
                  if (planId) updateSubPRDescription(planId, sp.index, desc);
                }}
              />
            </motion.div>
          ))}
        </div>

        {executions.length > 0 && (
          <Card>
            <CardContent className="p-4 space-y-2">
              <h3 className="text-sm font-semibold">Execution Status</h3>
              {executions.map((exec) => (
                <div key={exec.id} className="flex items-center justify-between text-xs">
                  <span>Sub-PR {exec.subPRIndex}</span>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        exec.status === "completed" ? "secondary" : exec.status === "failed" ? "destructive" : "outline"
                      }
                      className="text-[10px]"
                    >
                      {exec.status}
                    </Badge>
                    {exec.prUrl && (
                      <a
                        href={exec.prUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        PR #{exec.prNumber}
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <Sheet open={!!selectedFile} onOpenChange={(open) => !open && setSelectedFile(null)}>
          <SheetContent side="right" className="sm:max-w-lg overflow-y-auto">
            <SheetHeader>
              <SheetTitle>File Preview</SheetTitle>
              <SheetDescription className="font-mono text-xs">{selectedFile?.path}</SheetDescription>
            </SheetHeader>
            <SheetBody>
              {selectedFile && (
                <DiffPreviewDrawer
                  data={{
                    filePath: selectedFile.path,
                    subPRTitle: selectedFile.subPRTitle,
                  }}
                />
              )}
            </SheetBody>
          </SheetContent>
        </Sheet>
      </>
    );
  }

  const prCountLabel =
    filteredPRs.length !== repoPRs.length
      ? `${filteredPRs.length.toLocaleString()} of ${repoPRs.length.toLocaleString()} PRs`
      : `${repoPRs.length.toLocaleString()} PR${repoPRs.length !== 1 ? "s" : ""}`;

  return (
    <>
      <div>
        <h1 className="text-2xl font-bold mb-1">PR Splitter</h1>
        <p className="text-sm text-muted-foreground">
          Select a large PR to analyze for intelligent splitting &middot; {prCountLabel}
        </p>
      </div>

      <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search PRs..."
              value={prFilters.search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-sm"
            />
          </div>
          <div className="flex items-center gap-1 ml-auto">
            <select
              value={prFilters.sortField}
              onChange={(e) => setSortField(e.target.value as PRSortField)}
              className="h-7 rounded-md border border-input bg-background px-2 text-xs outline-none"
            >
              {sortOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={toggleDirection}>
                    {prFilters.sortDirection === "desc" ? (
                      <ArrowDownAZ className="h-3.5 w-3.5" />
                    ) : (
                      <ArrowUpAZ className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{prFilters.sortDirection === "desc" ? "Descending" : "Ascending"}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <CollapsibleTrigger asChild>
              <Button variant={filtersOpen ? "default" : "ghost"} size="sm" className="h-7 px-2 text-xs gap-1.5">
                <Filter className="h-3 w-3" />
                <span>Filters</span>
                {hasActiveFilters && !filtersOpen && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
              </Button>
            </CollapsibleTrigger>
          </div>
        </div>
        <CollapsibleContent className="pt-3 space-y-3">
          <div className="flex flex-wrap items-center gap-4">
            <div className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">State</span>
              <div className="flex items-center gap-0.5">
                {stateOptions.map((opt) => (
                  <Button
                    key={opt.value}
                    variant={prFilters.state === opt.value ? "default" : "ghost"}
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => setPRState(opt.value)}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Size</span>
              <div className="flex items-center gap-0.5">
                {sizeOptions.map((opt) => (
                  <Button
                    key={opt.value}
                    variant={prFilters.size === opt.value ? "default" : "ghost"}
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => setSize(opt.value)}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-1 min-w-[160px]">
              <span className="text-xs font-medium text-muted-foreground">Min comments: {minComments}</span>
              <Slider value={[minComments]} onValueChange={([v]) => setMinComments(v)} min={1} max={20} step={1} />
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <div className="flex-1 flex flex-col min-h-0">
        <Card className="flex-1 min-h-0">
          <CardContent className="p-2 space-y-1 overflow-y-auto max-h-[calc(100vh-320px)]">
            {filteredPRs.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">
                No large PRs found. PRs sized L or XL will appear here.
              </div>
            ) : (
              filteredPRs.map((pr) => {
                const linesChanged = pr.linesAdded + pr.linesDeleted;
                return (
                  <button
                    type="button"
                    key={pr.id}
                    className={cn(
                      "flex items-center gap-4 px-4 py-3 rounded-lg cursor-pointer transition-colors w-full text-left",
                      selectedPR === pr.id ? "bg-primary/10 border border-primary/30" : "hover:bg-muted/50",
                    )}
                    onClick={() => handleSelect(pr)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{pr.title}</span>
                        <span className="text-xs text-muted-foreground">#{pr.number}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        <span>{linesChanged.toLocaleString()} lines</span>
                        <span>&middot;</span>
                        <span>{pr.filesChanged} files</span>
                        {pr.githubCreatedAt && (
                          <>
                            <span>&middot;</span>
                            <span>
                              {new Date(pr.githubCreatedAt).toLocaleDateString(undefined, {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <Badge variant="outline" className={cn("text-[10px] border", SIZE_CLASSES[pr.size])}>
                      {pr.size}
                    </Badge>
                    {pr.htmlUrl && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <a
                              href={pr.htmlUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-muted-foreground hover:text-foreground transition-colors"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          </TooltipTrigger>
                          <TooltipContent>Open in GitHub</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                    {pr.complexity != null && (
                      <div
                        className={cn(
                          "h-8 w-8 rounded-full border-2 flex items-center justify-center text-xs font-bold",
                          pr.complexity >= 7
                            ? "border-status-error text-status-error"
                            : pr.complexity >= 4
                              ? "border-status-warning text-status-warning"
                              : "border-status-success text-status-success",
                        )}
                      >
                        {pr.complexity}
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </CardContent>
        </Card>

        <Button
          className="gradient-primary text-primary-foreground w-full mt-3 shrink-0"
          disabled={!selectedPR}
          onClick={handleAnalyze}
        >
          <Scissors className="h-4 w-4 mr-2" />
          Analyze for Splitting
        </Button>
      </div>
    </>
  );
}
