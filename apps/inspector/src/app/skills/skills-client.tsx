"use client";

import { useSessionStream } from "@claudekit/hooks";
import { Button } from "@claudekit/ui/components/button";
import { Card, CardContent } from "@claudekit/ui/components/card";
import { Checkbox } from "@claudekit/ui/components/checkbox";
import { Progress } from "@claudekit/ui/components/progress";
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from "@claudekit/ui/components/sheet";
import { Slider } from "@claudekit/ui/components/slider";
import type { StreamEntry } from "@claudekit/ui/components/streaming-display";
import { parseStreamLog, resetStreamIdCounter, StreamingDisplay } from "@claudekit/ui/components/streaming-display";
import {
  BookOpen,
  Brain,
  Code,
  Download,
  Filter,
  FolderOpen,
  GitCompareArrows,
  History,
  Square,
  TrendingUp,
} from "lucide-react";
import { motion } from "motion/react";
import { useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { AnalysisComparison } from "@/components/skills/analysis-comparison";
import { AnalysisHistory } from "@/components/skills/analysis-history";
import { SkillCard } from "@/components/skills/skill-card";
import { SkillDetailDrawer } from "@/components/skills/skill-detail-drawer";
import { exportSkillGroupAsFiles, getSkillGroupPreview, getSkillGroups } from "@/lib/actions/skill-groups";
import type { ComparisonSkill, SkillTrendPoint } from "@/lib/actions/skills";
import { getSkillsForAnalysis, startSkillAnalysis, startSkillRuleAnalysis } from "@/lib/actions/skills";
import type { PRWithComments, SkillGroup, SkillWithComments } from "@/lib/types";

// Dynamic imports to avoid linter type-only import optimization
const loadHistory = () => import("@/lib/actions/skills").then((m) => m.getAnalysisHistory);
const loadCompare = () => import("@/lib/actions/skills").then((m) => m.compareAnalyses);
const loadTrends = () => import("@/lib/actions/skills").then((m) => m.getSkillTrends);

const TREND_COLORS = [
  "hsl(252, 80%, 60%)",
  "hsl(217, 91%, 60%)",
  "hsl(142, 71%, 45%)",
  "hsl(38, 92%, 50%)",
  "hsl(0, 84%, 60%)",
  "hsl(280, 70%, 55%)",
];

function SkillTrendChart({ data }: { data: SkillTrendPoint[] }) {
  if (data.length < 2) {
    return (
      <div className="p-6 text-center text-muted-foreground text-sm">
        Need at least 2 analyses to show trends. Run more analyses over time.
      </div>
    );
  }

  // Collect all unique skill names across analyses
  const allSkills = new Set<string>();
  for (const point of data) {
    for (const skill of point.skills) {
      allSkills.add(skill.name);
    }
  }

  // Take top skills by max frequency across all analyses
  const skillMaxFreq = new Map<string, number>();
  for (const name of allSkills) {
    let max = 0;
    for (const point of data) {
      const s = point.skills.find((sk) => sk.name === name);
      if (s && s.frequency > max) max = s.frequency;
    }
    skillMaxFreq.set(name, max);
  }

  const topSkills = [...skillMaxFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name]) => name);

  // Build chart data
  const w = 500;
  const h = 200;
  const padX = 40;
  const padY = 20;
  const chartW = w - padX * 2;
  const chartH = h - padY * 2;
  const maxFreq = Math.max(...[...skillMaxFreq.values()], 1);

  const paths = topSkills.map((skillName, si) => {
    const points = data.map((point, pi) => {
      const freq = point.skills.find((s) => s.name === skillName)?.frequency ?? 0;
      const x = padX + (pi / (data.length - 1)) * chartW;
      const y = padY + chartH - (freq / maxFreq) * chartH;
      return { x, y };
    });

    const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
    return { name: skillName, d, color: TREND_COLORS[si % TREND_COLORS.length] };
  });

  const dateLabels = data.map((point, i) => {
    const x = padX + (i / (data.length - 1)) * chartW;
    const date = new Date(point.analysisDate);
    return { x, label: `${date.getMonth() + 1}/${date.getDate()}` };
  });

  return (
    <div className="space-y-3">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="w-full"
        style={{ maxHeight: "250px" }}
        role="img"
        aria-label="Skill frequency trends over time"
      >
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
          const y = padY + chartH - pct * chartH;
          return (
            <g key={pct}>
              <line x1={padX} y1={y} x2={w - padX} y2={y} stroke="currentColor" strokeOpacity={0.1} />
              <text x={padX - 8} y={y + 3} textAnchor="end" className="text-[10px] fill-muted-foreground">
                {Math.round(pct * maxFreq)}
              </text>
            </g>
          );
        })}

        {/* Date labels */}
        {dateLabels.map(({ x, label }) => (
          <text key={`${x}-${label}`} x={x} y={h - 2} textAnchor="middle" className="text-[10px] fill-muted-foreground">
            {label}
          </text>
        ))}

        {/* Lines */}
        {paths.map(({ name, d, color }) => (
          <path
            key={name}
            d={d}
            fill="none"
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {/* Dots */}
        {paths.map(({ name, color }) =>
          data.map((point, pi) => {
            const freq = point.skills.find((s) => s.name === name)?.frequency ?? 0;
            if (freq === 0) return null;
            const cx = padX + (pi / (data.length - 1)) * chartW;
            const cy = padY + chartH - (freq / maxFreq) * chartH;
            return <circle key={`${name}-${point.analysisDate}`} cx={cx} cy={cy} r="3" fill={color} />;
          }),
        )}
      </svg>

      {/* Legend */}
      <div className="flex gap-3 flex-wrap justify-center">
        {paths.map(({ name, color }) => (
          <div key={name} className="flex items-center gap-1.5 text-xs">
            <div className="h-2 w-2 rounded-full" style={{ background: color }} />
            <span className="text-muted-foreground">{name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

type Phase = "select" | "analyzing" | "generating_rules" | "results";

interface AnalysisHistoryEntry {
  id: string;
  prNumbers: number[];
  createdAt: string;
  skillCount: number;
  topSkills: string[];
}

interface SkillsClientProps {
  repoId: string | null;
  prsWithComments: PRWithComments[];
  previousSkills: SkillWithComments[];
  skillGroups: SkillGroup[];
}

export function SkillsClient({ repoId, prsWithComments, previousSkills, skillGroups }: SkillsClientProps) {
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
  const [isPending, startTransition] = useTransition();
  const [selectedSkill, setSelectedSkill] = useState<SkillWithComments | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<AnalysisHistoryEntry[]>([]);
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string | undefined>(undefined);
  const [compareMode, setCompareMode] = useState(false);
  const [compareIds, setCompareIds] = useState<[string | null, string | null]>([null, null]);
  const [comparison, setComparison] = useState<ComparisonSkill[]>([]);
  const [showTrends, setShowTrends] = useState(false);
  const [trendData, setTrendData] = useState<SkillTrendPoint[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [activeSessionType, setActiveSessionType] = useState<"skill_analysis" | "skill_rule_analysis">(
    "skill_analysis",
  );
  const [currentSkillGroups, setCurrentSkillGroups] = useState<SkillGroup[]>(skillGroups);
  const [previewGroup, setPreviewGroup] = useState<SkillGroup | null>(null);
  const [previewContent, setPreviewContent] = useState<string[]>([]);

  const handleSessionComplete = useCallback(
    (event: { type: string; data?: Record<string, unknown> }) => {
      if (event.type === "done") {
        if (activeSessionType === "skill_rule_analysis") {
          const ruleCount = (event.data as { ruleCount?: number })?.ruleCount ?? 0;
          const analysisId = (event.data as { analysisId?: string })?.analysisId;
          startTransition(async () => {
            if (analysisId) {
              const results = await getSkillsForAnalysis(analysisId);
              setSkills(results);
            }
            const groups = await getSkillGroups();
            setCurrentSkillGroups(groups);
            setPhase("results");
            toast.success("Rule generation complete", {
              description: `Generated ${ruleCount.toLocaleString()} SKILL.md rule${ruleCount !== 1 ? "s" : ""}`,
            });
          });
        } else {
          const analysisId = (event.data as { analysisId?: string })?.analysisId;
          if (analysisId) {
            startTransition(async () => {
              const results = await getSkillsForAnalysis(analysisId);
              setSkills(results);
              setPhase("results");
              toast.success("Skill analysis complete", {
                description: `Found ${results.length.toLocaleString()} skill pattern${results.length !== 1 ? "s" : ""}`,
              });
            });
          } else {
            setPhase("results");
          }
        }
      } else if (event.type === "error") {
        const label = activeSessionType === "skill_rule_analysis" ? "Rule generation" : "Skill analysis";
        toast.error(`${label} failed`, { description: event.data?.message as string });
        setPhase(activeSessionType === "skill_rule_analysis" ? "results" : "select");
      } else if (event.type === "cancelled") {
        toast.info(activeSessionType === "skill_rule_analysis" ? "Rule generation cancelled" : "Analysis cancelled");
        setPhase(activeSessionType === "skill_rule_analysis" ? "results" : "select");
      }
      setSessionId(null);
    },
    [activeSessionType],
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

  const isStreaming = stream.status === "streaming";

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
    if (!repoId) {
      toast.error("No repository selected");
      return;
    }
    setActiveSessionType("skill_analysis");
    setPhase("analyzing");
    startTransition(async () => {
      try {
        const id = await startSkillAnalysis(repoId, [...selected]);
        setSessionId(id);
      } catch (err) {
        toast.error("Failed to start analysis", {
          description: err instanceof Error ? err.message : "Unknown error",
        });
        setPhase("select");
      }
    });
  };

  const handleGenerateRules = () => {
    if (!repoId) {
      toast.error("No repository selected");
      return;
    }
    // Derive PR numbers from current skills' comments, fallback to selected PRs
    const prNumbersFromSkills = new Set<number>();
    for (const skill of skills) {
      for (const comment of skill.comments) {
        prNumbersFromSkills.add(comment.prNumber);
      }
    }
    const prNumbers = prNumbersFromSkills.size > 0 ? [...prNumbersFromSkills] : [...selected];
    if (prNumbers.length === 0) {
      toast.error("No PRs available for rule generation");
      return;
    }

    setActiveSessionType("skill_rule_analysis");
    setPhase("generating_rules");
    startTransition(async () => {
      try {
        const id = await startSkillRuleAnalysis(repoId, prNumbers);
        setSessionId(id);
      } catch (err) {
        toast.error("Failed to start rule generation", {
          description: err instanceof Error ? err.message : "Unknown error",
        });
        setPhase("results");
      }
    });
  };

  if (phase === "analyzing" || phase === "generating_rules") {
    const isRules = phase === "generating_rules";
    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        {isRules ? (
          <BookOpen className="h-12 w-12 text-primary mb-6 animate-pulse" />
        ) : (
          <Brain className="h-12 w-12 text-primary mb-6 animate-pulse" />
        )}
        <h2 className="text-xl font-bold mb-2">{isRules ? "Generating SKILL.md Rules" : "Analyzing Skills"}</h2>
        {isRules && (
          <p className="text-sm text-muted-foreground mb-6">
            Analyzing PR diffs and comments to create actionable rules
          </p>
        )}
        <div className="w-full max-w-md space-y-4">
          <Progress value={stream.progress ?? 0} className="h-2" />
          {stream.phase && <p className="text-center text-sm font-medium">{stream.phase}</p>}
          {streamEntries.length > 0 && <StreamingDisplay entries={streamEntries} variant="chat" live={isStreaming} />}
          {stream.elapsed > 0 && <p className="text-center text-xs text-muted-foreground">{stream.elapsed}s elapsed</p>}
          <Button variant="outline" className="w-full" onClick={stream.cancel}>
            <Square className="h-3 w-3 mr-2" />
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  if (phase === "results") {
    return (
      <>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold mb-1">Skills Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Based on analysis of {(skills.length > 0 ? skills[0]?.totalPRs : selected.size)?.toLocaleString()} pull
              requests
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowHistory(!showHistory);
                if (!showHistory && history.length === 0 && repoId) {
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
                setShowTrends(!showTrends);
                if (!showTrends && trendData.length === 0 && repoId) {
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
                  selectedId={selectedAnalysisId}
                  onSelect={(analysisId) => {
                    setSelectedAnalysisId(analysisId);
                    startTransition(async () => {
                      const results = await getSkillsForAnalysis(analysisId);
                      setSkills(results);
                    });
                  }}
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

        {currentSkillGroups.length > 0 && (
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <FolderOpen className="h-4 w-4" />
                  Skill Groups
                </h3>
              </div>
              <div className="space-y-2">
                {currentSkillGroups.map((group) => (
                  <div
                    key={group.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-border/50 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{group.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {group.skillCount.toLocaleString()} skill{group.skillCount !== 1 ? "s" : ""} &middot;{" "}
                        {group.category}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => {
                          startTransition(async () => {
                            const previews = await getSkillGroupPreview(group.id);
                            if (previews.length === 0) {
                              toast.info("No skills with rule content in this group");
                              return;
                            }
                            setPreviewContent(previews);
                            setPreviewGroup(group);
                          });
                        }}
                      >
                        <Code className="h-3 w-3 mr-1" />
                        Preview
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => {
                          startTransition(async () => {
                            try {
                              const result = await exportSkillGroupAsFiles(group.id, "global");
                              toast.success(`Exported ${result.filesWritten.toLocaleString()} SKILL.md files`, {
                                description: result.directory,
                                duration: 5000,
                              });
                            } catch (err) {
                              toast.error("Export failed", {
                                description: err instanceof Error ? err.message : "Unknown error",
                              });
                            }
                          });
                        }}
                      >
                        <Download className="h-3 w-3 mr-1" />
                        Export
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

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

        <Sheet open={!!previewGroup} onOpenChange={(open) => !open && setPreviewGroup(null)}>
          <SheetContent side="right" className="sm:max-w-xl overflow-y-auto">
            <SheetHeader>
              <SheetTitle>{previewGroup?.name} — Preview</SheetTitle>
            </SheetHeader>
            <SheetBody>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  {previewContent.length.toLocaleString()} SKILL.md file{previewContent.length !== 1 ? "s" : ""} in{" "}
                  <span className="font-medium text-foreground">{previewGroup?.category}</span>
                </p>
                {previewContent.map((content) => (
                  <div key={content} className="rounded-lg border border-border/50 overflow-hidden">
                    <pre className="p-4 text-xs font-mono whitespace-pre-wrap bg-muted/30 overflow-x-auto">
                      {content}
                    </pre>
                  </div>
                ))}
              </div>
            </SheetBody>
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return (
    <>
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
                    <span className="text-xs text-muted-foreground">{pr.commentCount.toLocaleString()} comments</span>
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
        Analyze Feedback ({selected.size.toLocaleString()} PR{selected.size !== 1 ? "s" : ""})
      </Button>
    </>
  );
}
