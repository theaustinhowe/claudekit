"use client";

import { Button } from "@devkit/ui/components/button";
import { Card, CardContent } from "@devkit/ui/components/card";
import { Checkbox } from "@devkit/ui/components/checkbox";
import { Progress } from "@devkit/ui/components/progress";
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from "@devkit/ui/components/sheet";
import { Slider } from "@devkit/ui/components/slider";
import { Brain, Check, Filter } from "lucide-react";
import { motion } from "motion/react";
import { useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { SkillCard } from "@/components/skills/skill-card";
import { SkillDetailDrawer } from "@/components/skills/skill-detail-drawer";
import { getSkillsForAnalysis, startSkillAnalysis } from "@/lib/actions/skills";
import type { PRWithComments, SkillWithComments } from "@/lib/types";

type Phase = "select" | "analyzing" | "results";

const analysisSteps = [
  "Extracting review comments\u2026",
  "Categorizing feedback patterns\u2026",
  "Identifying skill gaps\u2026",
  "Building improvement plan\u2026",
];

interface SkillsClientProps {
  repoId: string;
  prsWithComments: PRWithComments[];
  previousSkills: SkillWithComments[];
}

export function SkillsClient({ repoId, prsWithComments, previousSkills }: SkillsClientProps) {
  const searchParams = useSearchParams();
  const preselected = searchParams.get("pr");

  const [selected, setSelected] = useState<Set<number>>(() => {
    const s = new Set<number>();
    if (preselected) s.add(Number(preselected));
    return s;
  });
  const [minComments, setMinComments] = useState(1);
  const [phase, setPhase] = useState<Phase>(previousSkills.length > 0 ? "results" : "select");
  const [skills, setSkills] = useState<SkillWithComments[]>(previousSkills);
  const [step, setStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isPending, startTransition] = useTransition();
  const [selectedSkill, setSelectedSkill] = useState<SkillWithComments | null>(null);

  const filtered = prsWithComments.filter((p) => p.commentCount >= minComments);

  const togglePR = (num: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(num) ? next.delete(num) : next.add(num);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((p) => p.number)));
  };

  const handleAnalyze = () => {
    setPhase("analyzing");
    setStep(0);
    setProgress(0);

    // Animate progress steps
    let currentStep = 0;
    const interval = setInterval(() => {
      currentStep++;
      setStep(currentStep);
      setProgress((currentStep / analysisSteps.length) * 100);

      if (currentStep >= analysisSteps.length) {
        clearInterval(interval);
        // Call the actual analysis
        startTransition(async () => {
          try {
            const analysisId = await startSkillAnalysis(repoId, [...selected]);
            const results = await getSkillsForAnalysis(analysisId);
            setSkills(results);
            setPhase("results");
            toast.success("Skill analysis complete", {
              description: `Found ${results.length} skill pattern${results.length !== 1 ? "s" : ""}`,
            });
          } catch (err) {
            toast.error("Skill analysis failed", {
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
        <Brain className="h-12 w-12 text-primary mb-6 animate-pulse" />
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
          {isPending && step >= analysisSteps.length && (
            <p className="text-center text-sm text-muted-foreground animate-pulse">Running Claude analysis...</p>
          )}
        </div>
      </div>
    );
  }

  if (phase === "results") {
    return (
      <div className="p-6 max-w-[1200px] mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold mb-1">Skills Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Based on analysis of {skills.length > 0 ? skills[0]?.totalPRs : selected.size} pull requests
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              setPhase("select");
              setSelected(new Set());
            }}
          >
            New Analysis
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {skills.map((skill, i) => (
            <motion.div
              key={skill.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
            >
              <SkillCard skill={skill} onClick={() => setSelectedSkill(skill)} />
            </motion.div>
          ))}
        </div>

        {skills.length === 0 && (
          <div className="text-center p-8 text-muted-foreground">
            No skill patterns found. Try selecting more PRs with review comments.
          </div>
        )}

        <Sheet open={!!selectedSkill} onOpenChange={(open) => !open && setSelectedSkill(null)}>
          <SheetContent side="right" className="sm:max-w-lg overflow-y-auto">
            <SheetHeader>
              <SheetTitle>{selectedSkill?.name}</SheetTitle>
            </SheetHeader>
            <SheetBody>{selectedSkill && <SkillDetailDrawer skill={selectedSkill} />}</SheetBody>
          </SheetContent>
        </Sheet>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[900px] mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-1">Skill Builder</h1>
        <p className="text-sm text-muted-foreground">Select PRs with review feedback to uncover growth areas</p>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <Button variant="outline" size="sm" onClick={selectAll}>
          {selected.size === filtered.length ? "Deselect All" : "Select All"}
        </Button>
        <div className="flex items-center gap-2 text-sm">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">Min comments:</span>
          <Slider
            value={[minComments]}
            onValueChange={(v) => setMinComments(v[0])}
            min={1}
            max={20}
            step={1}
            className="w-32"
          />
          <span className="font-mono text-xs w-6">{minComments}</span>
        </div>
      </div>

      <Card>
        <CardContent className="p-2 space-y-1">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">No PRs match the current filters.</div>
          ) : (
            filtered.map((pr) => (
              // biome-ignore lint/a11y/noLabelWithoutControl: label wraps Checkbox component
              <label
                key={pr.number}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
              >
                <Checkbox checked={selected.has(pr.number)} onCheckedChange={() => togglePR(pr.number)} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{pr.title}</span>
                    <span className="text-xs text-muted-foreground">#{pr.number}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-muted-foreground">{pr.commentCount} comments</span>
                  </div>
                </div>
              </label>
            ))
          )}
        </CardContent>
      </Card>

      <Button
        className="gradient-primary text-primary-foreground w-full"
        disabled={selected.size === 0}
        onClick={handleAnalyze}
      >
        <Brain className="h-4 w-4 mr-2" />
        Analyze Feedback ({selected.size} PR{selected.size !== 1 ? "s" : ""})
      </Button>
    </div>
  );
}
