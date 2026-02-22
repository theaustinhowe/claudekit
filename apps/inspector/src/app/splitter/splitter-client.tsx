"use client";

import { cn } from "@devkit/ui";
import { Badge } from "@devkit/ui/components/badge";
import { Button } from "@devkit/ui/components/button";
import { Card, CardContent } from "@devkit/ui/components/card";
import { Progress } from "@devkit/ui/components/progress";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@devkit/ui/components/sheet";
import { ArrowDown, Check, ClipboardCopy, Scissors } from "lucide-react";
import { motion } from "motion/react";
import { useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { DiffPreviewDrawer } from "@/components/splitter/diff-preview-drawer";
import { SubPRCard } from "@/components/splitter/sub-pr-card";
import { getSplitPlan, startSplitAnalysis, updateSubPRDescription } from "@/lib/actions/splitter";
import { SIZE_CLASSES, SUB_PR_COLORS } from "@/lib/constants";
import { exportSplitPlanToMarkdown } from "@/lib/export";
import type { PRWithComments, SubPR } from "@/lib/types";

type Phase = "select" | "analyzing" | "results";

const analysisSteps = [
  "Parsing diff\u2026",
  "Building file dependency graph\u2026",
  "Detecting logical boundaries\u2026",
  "Generating split plan\u2026",
];

interface SplitterClientProps {
  repoId: string;
  largePRs: PRWithComments[];
}

export function SplitterClient({ repoId, largePRs }: SplitterClientProps) {
  const searchParams = useSearchParams();
  const preselected = searchParams.get("pr");

  const [selectedPR, setSelectedPR] = useState<string | null>(preselected ? `${repoId}#${preselected}` : null);
  const [_selectedNumber, setSelectedNumber] = useState<number | null>(preselected ? Number(preselected) : null);
  const [phase, setPhase] = useState<Phase>("select");
  const [step, setStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const [planId, setPlanId] = useState<string | null>(null);
  const [plan, setPlan] = useState<{ prNumber: number; prTitle: string; totalLines: number; subPRs: SubPR[] } | null>(
    null,
  );
  const [isPending, startTransition] = useTransition();
  const [selectedFile, setSelectedFile] = useState<{ path: string; subPRTitle: string } | null>(null);

  const handleSelect = (pr: PRWithComments) => {
    setSelectedPR(pr.id);
    setSelectedNumber(pr.number);
  };

  const handleAnalyze = () => {
    if (!selectedPR) return;
    setPhase("analyzing");
    setStep(0);
    setProgress(0);

    let currentStep = 0;
    const interval = setInterval(() => {
      currentStep++;
      setStep(currentStep);
      setProgress((currentStep / analysisSteps.length) * 100);

      if (currentStep >= analysisSteps.length) {
        clearInterval(interval);
        startTransition(async () => {
          try {
            const newPlanId = await startSplitAnalysis(selectedPR);
            setPlanId(newPlanId);
            const result = await getSplitPlan(newPlanId);
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
          } catch (err) {
            toast.error("Split analysis failed", {
              description: err instanceof Error ? err.message : "Unknown error",
            });
            setPhase("select");
          }
        });
      }
    }, 1500);
  };

  if (phase === "analyzing") {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        <Scissors className="h-12 w-12 text-primary mb-6 animate-pulse" />
        <div className="w-full max-w-md space-y-6">
          <Progress value={progress} className="h-2" />
          <div className="space-y-2">
            {analysisSteps.map((s, i) => (
              <motion.div
                key={s}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: i <= step ? 1 : 0.3, x: 0 }}
                className="flex items-center gap-2 text-sm"
              >
                {i < step ? (
                  <Check className="h-4 w-4 text-status-success" />
                ) : i === step ? (
                  <div className="h-4 w-4 rounded-full border-2 border-primary animate-spin border-t-transparent" />
                ) : (
                  <div className="h-4 w-4 rounded-full border-2 border-muted" />
                )}
                <span className={i <= step ? "text-foreground" : "text-muted-foreground"}>{s}</span>
              </motion.div>
            ))}
          </div>

          {step >= 1 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-6 flex justify-center">
              <svg width="200" height="120" viewBox="0 0 200 120" aria-hidden="true">
                {[
                  { x: 40, y: 20 },
                  { x: 100, y: 15 },
                  { x: 160, y: 25 },
                  { x: 30, y: 60 },
                  { x: 80, y: 70 },
                  { x: 130, y: 55 },
                  { x: 170, y: 65 },
                  { x: 60, y: 100 },
                  { x: 120, y: 95 },
                  { x: 150, y: 105 },
                ].map((n, i) => (
                  <motion.circle
                    key={`${n.x}-${n.y}`}
                    cx={n.x}
                    cy={n.y}
                    r="6"
                    fill="hsl(var(--primary))"
                    opacity={0.7}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: i * 0.1 }}
                  />
                ))}
                {[
                  [40, 20, 100, 15],
                  [100, 15, 160, 25],
                  [40, 20, 80, 70],
                  [100, 15, 130, 55],
                  [80, 70, 120, 95],
                  [130, 55, 150, 105],
                  [30, 60, 60, 100],
                  [170, 65, 150, 105],
                ].map(([x1, y1, x2, y2], i) => (
                  <motion.line
                    key={`${x1}-${y1}-${x2}-${y2}`}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke="hsl(var(--primary))"
                    strokeWidth="1.5"
                    opacity={0.3}
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ delay: 0.5 + i * 0.15, duration: 0.4 }}
                  />
                ))}
              </svg>
            </motion.div>
          )}

          {isPending && step >= analysisSteps.length && (
            <p className="text-center text-sm text-muted-foreground animate-pulse">Running Claude analysis...</p>
          )}
        </div>
      </div>
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
