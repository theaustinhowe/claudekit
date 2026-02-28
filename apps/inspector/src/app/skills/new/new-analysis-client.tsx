"use client";

import { useSessionStream } from "@claudekit/hooks";
import { Button } from "@claudekit/ui/components/button";
import { Card, CardContent } from "@claudekit/ui/components/card";
import { Checkbox } from "@claudekit/ui/components/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@claudekit/ui/components/collapsible";
import { Input } from "@claudekit/ui/components/input";
import { Slider } from "@claudekit/ui/components/slider";
import type { StreamEntry } from "@claudekit/ui/components/streaming-display";
import { parseStreamLog, resetStreamIdCounter } from "@claudekit/ui/components/streaming-display";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@claudekit/ui/components/tooltip";
import { ArrowDownAZ, ArrowUpAZ, Brain, Filter, Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { AnalysisProgress } from "@/components/skills/analysis-progress";
import { useRepoContext } from "@/contexts/repo-context";
import { usePRFilters } from "@/hooks/use-pr-filters";
import { startSkillAnalysis } from "@/lib/actions/skills";
import type { PRSortField, PRWithComments } from "@/lib/types";

type Phase = "select" | "analyzing";

const sortOptions: { value: PRSortField; label: string }[] = [
  { value: "created", label: "Created" },
  { value: "updated", label: "Updated" },
  { value: "comments", label: "Comments" },
  { value: "title", label: "A\u2013Z" },
];

interface NewAnalysisClientProps {
  repoId: string | null;
  prsWithComments: PRWithComments[];
}

export function NewAnalysisClient({ repoId, prsWithComments }: NewAnalysisClientProps) {
  const router = useRouter();
  const { selectedRepoId } = useRepoContext();
  const searchParams = useSearchParams();
  const preselected = searchParams.get("pr");

  const effectiveRepoId = selectedRepoId === "all" ? repoId : selectedRepoId;

  const [selected, setSelected] = useState<Set<number>>(() => {
    const s = new Set<number>();
    if (preselected) s.add(Number(preselected));
    return s;
  });
  const [phase, setPhase] = useState<Phase>("select");
  const [isPending, startTransition] = useTransition();
  const [sessionId, setSessionId] = useState<string | null>(null);

  const handleSessionComplete = useCallback(
    (event: { type: string; data?: Record<string, unknown> }) => {
      if (event.type === "done") {
        const analysisId = (event.data as { analysisId?: string })?.analysisId;
        if (analysisId) {
          toast.success("Skill analysis complete");
          router.push(`/skills/${analysisId}`);
        } else {
          toast.success("Skill analysis complete");
          router.push("/skills");
        }
      } else if (event.type === "error") {
        toast.error("Skill analysis failed", { description: event.data?.message as string });
        setPhase("select");
      } else if (event.type === "cancelled") {
        toast.info("Analysis cancelled");
        setPhase("select");
      }
      setSessionId(null);
    },
    [router],
  );

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

  const repoPRs =
    selectedRepoId === "all" ? prsWithComments : prsWithComments.filter((p) => p.repoId === selectedRepoId);
  const {
    filters: prFilters,
    filtered: hookFiltered,
    setSearch,
    setState: setPRState,
    setSize,
    setSortField,
    toggleDirection,
  } = usePRFilters(repoPRs, { defaultSortField: "comments", defaultSortDirection: "desc" });

  const [minComments, setMinComments] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const filtered = useMemo(
    () => hookFiltered.filter((pr) => pr.commentCount >= minComments),
    [hookFiltered, minComments],
  );

  const hasActiveFilters = prFilters.state !== "all" || prFilters.size !== "all" || minComments > 1;

  const togglePR = (num: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(num) ? next.delete(num) : next.add(num);
      return next;
    });
  };

  const allSelected = filtered.length > 0 && selected.size === filtered.length;
  const someSelected = selected.size > 0 && selected.size < filtered.length;
  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(filtered.map((p) => p.number)));
  };

  const handleAnalyze = () => {
    if (!effectiveRepoId) {
      toast.error("No repository selected");
      return;
    }
    setPhase("analyzing");
    startTransition(async () => {
      try {
        const id = await startSkillAnalysis(effectiveRepoId, [...selected]);
        setSessionId(id);
      } catch (err) {
        toast.error("Failed to start analysis", {
          description: err instanceof Error ? err.message : "Unknown error",
        });
        setPhase("select");
      }
    });
  };

  if (phase === "analyzing") {
    return (
      <AnalysisProgress
        variant="analyzing"
        progress={stream.progress ?? 0}
        phase={stream.phase}
        entries={streamEntries}
        isStreaming={stream.status === "streaming"}
        elapsed={stream.elapsed}
        onCancel={stream.cancel}
      />
    );
  }

  const prCountLabel =
    filtered.length !== repoPRs.length
      ? `${filtered.length.toLocaleString()} of ${repoPRs.length.toLocaleString()} PRs`
      : `${repoPRs.length.toLocaleString()} PR${repoPRs.length !== 1 ? "s" : ""}`;

  const stateOptions = [
    { value: "all" as const, label: "All" },
    { value: "open" as const, label: "Open" },
    { value: "closed" as const, label: "Closed" },
  ];

  const sizeOptions = [
    { value: "all" as const, label: "Any size" },
    { value: "S" as const, label: "S" },
    { value: "M" as const, label: "M" },
    { value: "L" as const, label: "L" },
    { value: "XL" as const, label: "XL" },
  ];

  return (
    <>
      <div>
        <h1 className="text-2xl font-bold mb-1">New Skill Analysis</h1>
        <p className="text-sm text-muted-foreground">
          Select PRs with review feedback to uncover growth areas &middot; {prCountLabel}
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
          <CardContent className="p-2 overflow-y-auto max-h-[calc(100vh-320px)]">
            {filtered.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">No PRs match the current filters.</div>
            ) : (
              <>
                {/* Select all header row */}
                {/* biome-ignore lint/a11y/noLabelWithoutControl: label wraps Checkbox component */}
                <label className="flex items-center gap-3 px-3 py-2 border-b border-border/50 cursor-pointer">
                  <Checkbox
                    checked={allSelected || someSelected}
                    indeterminate={someSelected}
                    onCheckedChange={toggleAll}
                  />
                  <span className="text-xs font-medium text-muted-foreground">
                    {selected.size > 0
                      ? `${selected.size.toLocaleString()} of ${filtered.length.toLocaleString()} selected`
                      : "Select all"}
                  </span>
                </label>
                <div className="space-y-0.5 mt-1">
                  {filtered.map((pr) => (
                    // biome-ignore lint/a11y/noLabelWithoutControl: label wraps Checkbox component
                    <label
                      key={pr.id}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                    >
                      <Checkbox checked={selected.has(pr.number)} onCheckedChange={() => togglePR(pr.number)} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">{pr.title}</span>
                          <span className="text-xs text-muted-foreground shrink-0">#{pr.number}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>
                            {pr.commentCount.toLocaleString()} comment{pr.commentCount !== 1 ? "s" : ""}
                          </span>
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
                    </label>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Button
          className="gradient-primary text-primary-foreground w-full mt-3 shrink-0"
          disabled={selected.size === 0 || isPending}
          onClick={handleAnalyze}
        >
          <Brain className="h-4 w-4 mr-2" />
          Analyze Feedback ({selected.size.toLocaleString()} PR{selected.size !== 1 ? "s" : ""})
        </Button>
      </div>
    </>
  );
}
