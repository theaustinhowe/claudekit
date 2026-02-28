"use client";

import { useSessionStream } from "@claudekit/hooks";
import { Button } from "@claudekit/ui/components/button";
import { Card, CardContent } from "@claudekit/ui/components/card";
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from "@claudekit/ui/components/sheet";
import type { StreamEntry } from "@claudekit/ui/components/streaming-display";
import { parseStreamLog, resetStreamIdCounter } from "@claudekit/ui/components/streaming-display";
import { BookOpen, GitCompareArrows, History, Plus, TrendingUp } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { parseAsString, parseAsStringLiteral, useQueryState } from "nuqs";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { AnalysisComparison } from "@/components/skills/analysis-comparison";
import { AnalysisHistory } from "@/components/skills/analysis-history";
import { AnalysisProgress } from "@/components/skills/analysis-progress";
import { SkillCard } from "@/components/skills/skill-card";
import { SkillDetailDrawer } from "@/components/skills/skill-detail-drawer";
import { SkillGroupsPanel } from "@/components/skills/skill-groups-panel";
import { SkillTrendChart } from "@/components/skills/skill-trend-chart";
import { getSkillGroups } from "@/lib/actions/skill-groups";
import type { ComparisonSkill, SkillTrendPoint } from "@/lib/actions/skills";
import { getSkillsForAnalysis, startSkillRuleAnalysis } from "@/lib/actions/skills";
import { GROUP_COLORS } from "@/lib/constants";
import type { SkillGroup, SkillWithComments } from "@/lib/types";

const loadHistory = () => import("@/lib/actions/skills").then((m) => m.getAnalysisHistory);
const loadCompare = () => import("@/lib/actions/skills").then((m) => m.compareAnalyses);
const loadTrends = () => import("@/lib/actions/skills").then((m) => m.getSkillTrends);

interface AnalysisDashboardClientProps {
  analysisId: string;
  repoId: string;
  prNumbers: number[];
  createdAt: string;
  skills: SkillWithComments[];
  skillGroups: SkillGroup[];
}

export function AnalysisDashboardClient({
  analysisId,
  repoId,
  prNumbers,
  createdAt,
  skills: initialSkills,
  skillGroups: initialSkillGroups,
}: AnalysisDashboardClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [skills, setSkills] = useState(initialSkills);
  const [currentSkillGroups, setCurrentSkillGroups] = useState(initialSkillGroups);
  const groupNameById = useMemo(() => new Map(currentSkillGroups.map((g) => [g.id, g.name])), [currentSkillGroups]);
  const groupColorById = useMemo(
    () => new Map(currentSkillGroups.map((g, i) => [g.id, GROUP_COLORS[i % GROUP_COLORS.length]])),
    [currentSkillGroups],
  );
  const sortedSkills = useMemo(() => {
    const groupOrder = new Map(currentSkillGroups.map((g, i) => [g.id, i]));
    return [...skills].sort((a, b) => {
      const aIdx = a.groupId ? (groupOrder.get(a.groupId) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;
      const bIdx = b.groupId ? (groupOrder.get(b.groupId) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;
      if (aIdx !== bIdx) return aIdx - bIdx;
      return b.frequency - a.frequency;
    });
  }, [skills, currentSkillGroups]);

  // URL-synced state
  const [activePanel, setActivePanel] = useQueryState("panel", parseAsStringLiteral(["history", "trends"] as const));
  const [selectedSkillId, setSelectedSkillId] = useQueryState("skill", parseAsString);
  const selectedSkill = useMemo(
    () => (selectedSkillId ? (skills.find((s) => s.id === selectedSkillId) ?? null) : null),
    [selectedSkillId, skills],
  );
  const showHistory = activePanel === "history";
  const showTrends = activePanel === "trends";

  // History panel
  const [history, setHistory] = useState<
    {
      id: string;
      prNumbers: number[];
      createdAt: string;
      skillCount: number;
      topSkills: { name: string; description: string | null }[];
    }[]
  >([]);
  const [compareMode, setCompareMode] = useState(false);
  const [compareIds, setCompareIds] = useState<[string | null, string | null]>([null, null]);
  const [comparison, setComparison] = useState<ComparisonSkill[]>([]);

  // Auto-load panel data when restored from URL
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional mount-only effect to restore URL state
  useEffect(() => {
    if (showHistory && history.length === 0) {
      startTransition(async () => {
        const fn = await loadHistory();
        const data = await fn(repoId);
        setHistory(data);
      });
    }
  }, []);

  // Trends panel
  const [trendData, setTrendData] = useState<SkillTrendPoint[]>([]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional mount-only effect to restore URL state
  useEffect(() => {
    if (showTrends && trendData.length === 0) {
      startTransition(async () => {
        const fn = await loadTrends();
        const data = await fn(repoId);
        setTrendData(data);
      });
    }
  }, []);

  // Rule generation
  const [isGenerating, setIsGenerating] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const handleSessionComplete = useCallback((event: { type: string; data?: Record<string, unknown> }) => {
    if (event.type === "done") {
      const ruleCount = (event.data as { ruleCount?: number })?.ruleCount ?? 0;
      const resultAnalysisId = (event.data as { analysisId?: string })?.analysisId;
      startTransition(async () => {
        if (resultAnalysisId) {
          const results = await getSkillsForAnalysis(resultAnalysisId);
          setSkills(results);
        }
        const groups = await getSkillGroups();
        setCurrentSkillGroups(groups);
        setIsGenerating(false);
        toast.success("Rule generation complete", {
          description: `Generated ${ruleCount.toLocaleString()} SKILL.md rule${ruleCount !== 1 ? "s" : ""}`,
        });
      });
    } else if (event.type === "error") {
      toast.error("Rule generation failed", { description: event.data?.message as string });
      setIsGenerating(false);
    } else if (event.type === "cancelled") {
      toast.info("Rule generation cancelled");
      setIsGenerating(false);
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

  const handleGenerateRules = () => {
    const prNums = new Set<number>();
    for (const skill of skills) {
      for (const comment of skill.comments) {
        prNums.add(comment.prNumber);
      }
    }
    const nums = prNums.size > 0 ? [...prNums] : prNumbers;
    if (nums.length === 0) {
      toast.error("No PRs available for rule generation");
      return;
    }

    setIsGenerating(true);
    startTransition(async () => {
      try {
        const id = await startSkillRuleAnalysis(repoId, nums);
        setSessionId(id);
      } catch (err) {
        toast.error("Failed to start rule generation", {
          description: err instanceof Error ? err.message : "Unknown error",
        });
        setIsGenerating(false);
      }
    });
  };

  if (isGenerating) {
    return (
      <AnalysisProgress
        variant="generating_rules"
        progress={stream.progress ?? 0}
        phase={stream.phase}
        entries={streamEntries}
        isStreaming={stream.status === "streaming"}
        elapsed={stream.elapsed}
        onCancel={stream.cancel}
      />
    );
  }

  const analysisDate = new Date(createdAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-1">Skills Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            {analysisDate} &middot; {prNumbers.length.toLocaleString()} PR{prNumbers.length !== 1 ? "s" : ""} &middot;{" "}
            {skills.length.toLocaleString()} skill{skills.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              const next = activePanel === "history" ? null : "history";
              setActivePanel(next);
              if (next === "history" && history.length === 0) {
                startTransition(async () => {
                  const fn = await loadHistory();
                  const data = await fn(repoId);
                  setHistory(data);
                });
              }
            }}
          >
            <History className="h-4 w-4 mr-2" />
            {showHistory ? "Hide History" : "History"}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              const next = activePanel === "trends" ? null : "trends";
              setActivePanel(next);
              if (next === "trends" && trendData.length === 0) {
                startTransition(async () => {
                  const fn = await loadTrends();
                  const data = await fn(repoId);
                  setTrendData(data);
                });
              }
            }}
          >
            <TrendingUp className="h-4 w-4 mr-2" />
            {showTrends ? "Hide Trends" : "Trends"}
          </Button>
          <Button variant="outline" onClick={handleGenerateRules}>
            <BookOpen className="h-4 w-4 mr-2" />
            Generate Rules
          </Button>
          <Button variant="outline" asChild>
            <Link href="/skills/new">
              <Plus className="h-4 w-4 mr-2" />
              New Analysis
            </Link>
          </Button>
        </div>
      </div>

      {showHistory && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">Analysis History</h3>
              {history.length >= 2 && (
                <Button
                  variant={compareMode ? "default" : "outline"}
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => {
                    setCompareMode(!compareMode);
                    setCompareIds([null, null]);
                    setComparison([]);
                  }}
                >
                  <GitCompareArrows className="h-3 w-3 mr-1" />
                  {compareMode ? "Exit Compare" : "Compare"}
                </Button>
              )}
            </div>
            {isPending && history.length === 0 ? (
              <p className="text-sm text-muted-foreground animate-pulse">Loading history...</p>
            ) : compareMode ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1.5">Before (A)</p>
                    <AnalysisHistory
                      history={history}
                      selectedId={compareIds[0] ?? undefined}
                      onSelect={(id) => setCompareIds(([_, b]) => [id, b])}
                    />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1.5">After (B)</p>
                    <AnalysisHistory
                      history={history}
                      selectedId={compareIds[1] ?? undefined}
                      onSelect={(id) => setCompareIds(([a]) => [a, id])}
                    />
                  </div>
                </div>
                {compareIds[0] && compareIds[1] && (
                  <Button
                    className="w-full"
                    size="sm"
                    disabled={isPending}
                    onClick={() => {
                      const [idA, idB] = compareIds;
                      if (!idA || !idB) return;
                      startTransition(async () => {
                        const fn = await loadCompare();
                        const result = await fn(idA, idB);
                        setComparison(result);
                      });
                    }}
                  >
                    Compare Analyses
                  </Button>
                )}
                {comparison.length > 0 && <AnalysisComparison comparison={comparison} />}
              </div>
            ) : (
              <AnalysisHistory
                history={history}
                selectedId={analysisId}
                onSelect={(id) => router.push(`/skills/${id}`)}
              />
            )}
          </CardContent>
        </Card>
      )}

      {showTrends && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-3">Skill Trends Over Time</h3>
            {isPending && trendData.length === 0 ? (
              <p className="text-sm text-muted-foreground animate-pulse">Loading trend data...</p>
            ) : (
              <SkillTrendChart data={trendData} />
            )}
          </CardContent>
        </Card>
      )}

      <SkillGroupsPanel groups={currentSkillGroups} colorMap={groupColorById} />

      {skills.length > 0 && (
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">
            {skills.length.toLocaleString()} Pattern{skills.length !== 1 ? "s" : ""}
          </h3>
          <span className="text-xs text-muted-foreground">across {prNumbers.length.toLocaleString()} PRs</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {sortedSkills.map((skill, i) => (
          <motion.div
            key={skill.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
          >
            <SkillCard
              skill={skill}
              groupName={skill.groupId ? groupNameById.get(skill.groupId) : null}
              groupColor={skill.groupId ? groupColorById.get(skill.groupId) : undefined}
              onClick={() => setSelectedSkillId(skill.id)}
            />
          </motion.div>
        ))}
      </div>

      {skills.length === 0 && (
        <div className="text-center p-8 text-muted-foreground">
          No skill patterns found. Try selecting more PRs with review comments.
        </div>
      )}

      <Sheet open={!!selectedSkill} onOpenChange={(open) => !open && setSelectedSkillId(null)}>
        <SheetContent side="right" className="sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{selectedSkill?.name}</SheetTitle>
          </SheetHeader>
          <SheetBody>{selectedSkill && <SkillDetailDrawer skill={selectedSkill} />}</SheetBody>
        </SheetContent>
      </Sheet>
    </>
  );
}
