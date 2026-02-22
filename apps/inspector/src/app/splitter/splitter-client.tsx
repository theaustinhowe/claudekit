"use client";

import { useSessionStream } from "@claudekit/hooks";
import { cn } from "@claudekit/ui";
import { Badge } from "@claudekit/ui/components/badge";
import { Button } from "@claudekit/ui/components/button";
import { Card, CardContent } from "@claudekit/ui/components/card";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@claudekit/ui/components/sheet";
import { ArrowDown, ClipboardCopy, Scissors } from "lucide-react";
import { motion } from "motion/react";
import { useSearchParams } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { toast } from "sonner";
import { SessionProgress } from "@/components/session-progress";
import { DiffPreviewDrawer } from "@/components/splitter/diff-preview-drawer";
import { SubPRCard } from "@/components/splitter/sub-pr-card";
import { getSplitPlan, startSplitAnalysis, updateSubPRDescription } from "@/lib/actions/splitter";
import { SIZE_CLASSES, SUB_PR_COLORS } from "@/lib/constants";
import { exportSplitPlanToMarkdown } from "@/lib/export";
import type { PRWithComments, SubPR } from "@/lib/types";

type Phase = "select" | "analyzing" | "results";

interface SplitterClientProps {
  repoId: string;
  largePRs: PRWithComments[];
}

export function SplitterClient({ repoId, largePRs }: SplitterClientProps) {
  const searchParams = useSearchParams();
  const preselected = searchParams.get("pr");

  const [selectedPR, setSelectedPR] = useState<string | null>(preselected ? `${repoId}#${preselected}` : null);
  const [phase, setPhase] = useState<Phase>("select");
  const [planId, setPlanId] = useState<string | null>(null);
  const [plan, setPlan] = useState<{ prNumber: number; prTitle: string; totalLines: number; subPRs: SubPR[] } | null>(
    null,
  );
  const [_isPending, startTransition] = useTransition();
  const [selectedFile, setSelectedFile] = useState<{ path: string; subPRTitle: string } | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

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

  if (phase === "analyzing") {
    return (
      <SessionProgress stream={stream} icon={<Scissors className="h-12 w-12 text-primary mb-6 animate-pulse" />} />
    );
  }

  if (phase === "results" && plan) {
    return (
      <div className="p-6 max-w-[1000px] mx-auto space-y-6">
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
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[900px] mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-1">PR Splitter</h1>
        <p className="text-sm text-muted-foreground">Select a large PR to analyze for intelligent splitting</p>
      </div>

      <Card>
        <CardContent className="p-2 space-y-1">
          {largePRs.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              No large PRs found. PRs sized L or XL will appear here.
            </div>
          ) : (
            largePRs.map((pr) => {
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
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span>{linesChanged} lines</span>
                      <span>{pr.filesChanged} files</span>
                    </div>
                  </div>
                  <Badge variant="outline" className={cn("text-[10px] border", SIZE_CLASSES[pr.size])}>
                    {pr.size}
                  </Badge>
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
        className="gradient-primary text-primary-foreground w-full"
        disabled={!selectedPR}
        onClick={handleAnalyze}
      >
        <Scissors className="h-4 w-4 mr-2" />
        Analyze for Splitting
      </Button>
    </div>
  );
}
