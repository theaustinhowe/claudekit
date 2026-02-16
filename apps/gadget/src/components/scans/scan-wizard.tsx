"use client";

import { useSessionStream } from "@devkit/hooks";
import { Badge } from "@devkit/ui/components/badge";
import { Button } from "@devkit/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@devkit/ui/components/card";
import { Checkbox } from "@devkit/ui/components/checkbox";
import { Input } from "@devkit/ui/components/input";
import { Label } from "@devkit/ui/components/label";
import { Progress } from "@devkit/ui/components/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@devkit/ui/components/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@devkit/ui/components/tooltip";
import { Check, ChevronLeft, ChevronRight, FolderOpen, Loader2, Play, Plus, X, XCircle } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { DirectoryPicker } from "@/components/directory-picker";
import { matchPolicy } from "@/lib/services/policy-matcher";
import type { Policy, RepoType, RepoWithCounts, ScanRoot } from "@/lib/types";
import { formatNumber } from "@/lib/utils";

interface DiscoveredPreviewRepo {
  name: string;
  localPath: string;
  repoType: string | null;
  packageManager: string | null;
  isMonorepo: boolean;
  gitRemote: string | null;
  defaultBranch: string;
}

type ScanStep = "roots" | "discovery" | "policy" | "running" | "complete";

const defaultExcludePatterns = ["node_modules", "dist", ".next", "vendor", "tmp", ".git"];

interface ScanWizardProps {
  policies: Policy[];
  repos: RepoWithCounts[];
  savedScanRoots: ScanRoot[];
}

export function ScanWizard({ policies, repos: _repos, savedScanRoots }: ScanWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState<ScanStep>("roots");
  const [scanRoots, setScanRoots] = useState<string[]>(
    savedScanRoots.length > 0 ? savedScanRoots.map((r) => r.path) : ["~"],
  );
  const [excludePatterns, setExcludePatterns] = useState<string>(defaultExcludePatterns.join(", "));
  const [policyOverrides, setPolicyOverrides] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [discoveredRepos, setDiscoveredRepos] = useState<DiscoveredPreviewRepo[]>([]);
  const [selectedDiscovered, setSelectedDiscovered] = useState<string[]>([]);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const session = useSessionStream({
    sessionId,
    autoConnect: true,
    onComplete: () => {
      setStep("complete");
    },
  });

  const progress = session.progress ?? 0;
  const phase = session.phase ?? "Discovering";
  const runLog = session.logs.map((l) => l.log);
  const sessionError = session.error;

  const runDiscovery = useCallback(async () => {
    setIsDiscovering(true);
    setError(null);
    try {
      const res = await fetch("/api/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roots: scanRoots.filter((r) => r.trim() !== ""),
          excludePatterns: excludePatterns.split(",").map((p) => p.trim()),
        }),
      });
      if (!res.ok) throw new Error("Discovery failed");
      const data = await res.json();
      setDiscoveredRepos(data.repos);
      setSelectedDiscovered(data.repos.map((r: DiscoveredPreviewRepo) => r.localPath));
    } catch {
      setDiscoveredRepos([]);
      setSelectedDiscovered([]);
      setError("Discovery failed. Check that the scan directories exist and try again.");
    } finally {
      setIsDiscovering(false);
    }
  }, [scanRoots, excludePatterns]);

  const addRoot = () => {
    setScanRoots([...scanRoots, ""]);
  };

  const removeRoot = (index: number) => {
    setScanRoots(scanRoots.filter((_, i) => i !== index));
  };

  const updateRoot = (index: number, value: string) => {
    const newRoots = [...scanRoots];
    newRoots[index] = value;
    setScanRoots(newRoots);
  };

  const startScan = async () => {
    setStep("running");
    setSessionId(null);
    setError(null);

    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "scan",
          label: "Scan",
          metadata: {
            scanRoots,
            excludePatterns: excludePatterns.split(",").map((p) => p.trim()),
            selectedRepoPaths: selectedDiscovered,
            policyId: null,
            autoMatch: true,
            policyOverrides,
          },
        }),
      });

      if (!res.ok) throw new Error("Failed to start scan session");

      const data = await res.json();
      setSessionId(data.sessionId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Scan failed. Please check your scan roots and try again.";
      setError(message);
    }
  };

  const renderStep = () => {
    switch (step) {
      case "roots":
        return (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            <Card>
              <CardHeader>
                <CardTitle>Choose Scan Roots</CardTitle>
                <CardDescription>Add directories to scan for repositories</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {scanRoots.map((root, index) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: Scan roots are mutable by index, no stable ID available
                  <div key={index} className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <FolderOpen className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <DirectoryPicker
                      value={root}
                      onChange={(val) => updateRoot(index, val)}
                      placeholder="~/path/to/directory"
                      className="flex-1"
                    />
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeRoot(index)}
                            disabled={scanRoots.length === 1}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Remove</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                ))}
                <Button variant="outline" onClick={addRoot} className="w-full">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Directory
                </Button>

                <div className="pt-4 border-t">
                  <Label className="text-sm text-muted-foreground mb-2 block">Exclude Patterns</Label>
                  <Input
                    value={excludePatterns}
                    onChange={(e) => setExcludePatterns(e.target.value)}
                    placeholder="node_modules, dist, .next"
                    className="font-mono text-sm"
                  />
                </div>
              </CardContent>
            </Card>
          </motion.div>
        );

      case "discovery":
        return (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Discovery Preview</CardTitle>
                    <CardDescription>
                      {isDiscovering
                        ? "Scanning directories for repositories..."
                        : `Found ${formatNumber(discoveredRepos.length)} repositories. Select which to include.`}
                    </CardDescription>
                  </div>
                  {!isDiscovering && discoveredRepos.length > 0 && (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedDiscovered(discoveredRepos.map((r) => r.localPath))}
                      >
                        Select All
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setSelectedDiscovered([])}>
                        Clear
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {isDiscovering ? (
                  <div className="flex items-center justify-center py-12 gap-3 text-muted-foreground">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Discovering repositories...</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {discoveredRepos.map((repo) => (
                      // biome-ignore lint/a11y/useSemanticElements: contains nested Checkbox
                      <div
                        role="button"
                        tabIndex={0}
                        key={repo.localPath}
                        className="flex items-center gap-4 p-3 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer w-full text-left"
                        onClick={() =>
                          setSelectedDiscovered((prev) =>
                            prev.includes(repo.localPath)
                              ? prev.filter((p) => p !== repo.localPath)
                              : [...prev, repo.localPath],
                          )
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelectedDiscovered((prev) =>
                              prev.includes(repo.localPath)
                                ? prev.filter((p) => p !== repo.localPath)
                                : [...prev, repo.localPath],
                            );
                          }
                        }}
                      >
                        <Checkbox
                          checked={selectedDiscovered.includes(repo.localPath)}
                          onCheckedChange={() =>
                            setSelectedDiscovered((prev) =>
                              prev.includes(repo.localPath)
                                ? prev.filter((p) => p !== repo.localPath)
                                : [...prev, repo.localPath],
                            )
                          }
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium">{repo.name}</p>
                          <p className="text-sm text-muted-foreground font-mono truncate">{repo.localPath}</p>
                        </div>
                        {repo.packageManager && (
                          <Badge variant="secondary" className="capitalize">
                            {repo.packageManager}
                          </Badge>
                        )}
                        {repo.repoType && (
                          <Badge variant="outline" className="capitalize">
                            {repo.repoType}
                          </Badge>
                        )}
                      </div>
                    ))}
                    {discoveredRepos.length === 0 && !error && (
                      <p className="text-muted-foreground text-center py-8">
                        No repositories found in the specified directories. Check your scan roots and try again.
                      </p>
                    )}
                    {error && (
                      <div className="text-center py-8 space-y-3">
                        <XCircle className="w-8 h-8 text-destructive/60 mx-auto" />
                        <p className="text-destructive text-sm">{error}</p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setError(null);
                            prevStep();
                          }}
                        >
                          Go Back
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        );

      case "policy": {
        const selectedRepos = discoveredRepos.filter((r) => selectedDiscovered.includes(r.localPath));
        return (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            <Card>
              <CardHeader>
                <CardTitle>Policy Matching</CardTitle>
                <CardDescription>
                  Policies are auto-matched based on each repo's detected type. Override any match below.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/50 border-b">
                        <th className="text-left p-3 font-medium">Repository</th>
                        <th className="text-left p-3 font-medium">Detected Type</th>
                        <th className="text-left p-3 font-medium">Matched Policy</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedRepos.map((repo) => {
                        const matched = matchPolicy(
                          {
                            repo_type: repo.repoType as RepoType | null,
                            is_monorepo: repo.isMonorepo,
                          },
                          policies,
                        );
                        const overrideId = policyOverrides[repo.localPath];
                        const displayPolicy = overrideId
                          ? policies.find((p) => p.id === overrideId) || matched
                          : matched;
                        return (
                          <tr key={repo.localPath} className="border-b last:border-b-0">
                            <td className="p-3">
                              <p className="font-medium">{repo.name}</p>
                              <p className="text-xs text-muted-foreground font-mono truncate max-w-50">
                                {repo.localPath}
                              </p>
                            </td>
                            <td className="p-3">
                              <div className="flex gap-1.5">
                                {repo.isMonorepo && (
                                  <Badge variant="outline" className="text-xs">
                                    monorepo
                                  </Badge>
                                )}
                                {repo.repoType && (
                                  <Badge variant="secondary" className="capitalize text-xs">
                                    {repo.repoType}
                                  </Badge>
                                )}
                                {!repo.repoType && !repo.isMonorepo && (
                                  <span className="text-muted-foreground text-xs">unknown</span>
                                )}
                              </div>
                            </td>
                            <td className="p-3">
                              <Select
                                value={overrideId || displayPolicy?.id || ""}
                                onValueChange={(val) => {
                                  setPolicyOverrides((prev) => {
                                    if (val === matched?.id) {
                                      const next = { ...prev };
                                      delete next[repo.localPath];
                                      return next;
                                    }
                                    return { ...prev, [repo.localPath]: val };
                                  });
                                }}
                              >
                                <SelectTrigger className="h-8 text-xs w-45">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {policies.map((policy) => (
                                    <SelectItem key={policy.id} value={policy.id}>
                                      {policy.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        );
      }

      case "running": {
        const scanError = error || sessionError;
        return (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {scanError ? (
                    <XCircle className="w-5 h-5 text-destructive" />
                  ) : (
                    <Loader2 className="w-5 h-5 animate-spin text-primary" />
                  )}
                  {scanError ? "Scan Failed" : "Scanning Repositories"}
                </CardTitle>
                <CardDescription>{scanError ? scanError : `${phase}... ${progress}%`}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {scanError ? (
                  <div className="flex justify-center gap-4 pt-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setStep("roots");
                        setError(null);
                        setSessionId(null);
                      }}
                    >
                      Start Over
                    </Button>
                    <Button onClick={() => startScan()}>
                      <Play className="w-4 h-4 mr-2" />
                      Retry
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Progress</span>
                        <span className="font-medium">{phase}</span>
                      </div>
                      <Progress value={progress} className="h-2" />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Discovering</span>
                        <span>Parsing</span>
                        <span>Analyzing</span>
                        <span>Fixes</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {discoveredRepos
                        .filter((r) => selectedDiscovered.includes(r.localPath))
                        .map((repo, i) => (
                          <Badge
                            key={repo.localPath}
                            variant={progress >= (i + 1) * 25 ? "default" : "secondary"}
                            className="gap-1"
                          >
                            {progress >= (i + 1) * 25 ? (
                              <Check className="w-3 h-3" />
                            ) : progress >= i * 25 ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : null}
                            {repo.name}
                          </Badge>
                        ))}
                    </div>
                  </>
                )}

                <div className="bg-muted rounded-lg p-4 font-mono text-sm h-48 overflow-y-auto">
                  {runLog.map((log, i) => (
                    <div
                      // biome-ignore lint/suspicious/noArrayIndexKey: Log entries are append-only and have no unique ID
                      key={i}
                      className={`${
                        log.includes("[ERROR]")
                          ? "text-destructive"
                          : log.includes("[WARN]")
                            ? "text-warning"
                            : log.includes("[SUCCESS]")
                              ? "text-success"
                              : "text-muted-foreground"
                      }`}
                    >
                      {log}
                    </div>
                  ))}
                  {!scanError && <span className="animate-pulse">&#9611;</span>}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        );
      }

      case "complete":
        return (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
            <Card>
              <CardContent className="p-8 text-center">
                <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-4">
                  <Check className="w-8 h-8 text-success" />
                </div>
                <h2 className="text-2xl font-bold mb-2">Scan Complete</h2>
                <p className="text-muted-foreground mb-6">
                  Scan finished across {formatNumber(selectedDiscovered.length)} repositories
                </p>
                <div className="flex justify-center gap-4">
                  <Button onClick={() => router.push("/repositories")}>View Results</Button>
                  <Button variant="outline" onClick={() => setStep("roots")}>
                    New Scan
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        );
    }
  };

  const canProceed = () => {
    switch (step) {
      case "roots":
        return scanRoots.some((r) => r.trim() !== "");
      case "discovery":
        return selectedDiscovered.length > 0 && !isDiscovering && !error;
      case "policy":
        return true;
      default:
        return false;
    }
  };

  const nextStep = () => {
    const steps: ScanStep[] = ["roots", "discovery", "policy"];
    const currentIndex = steps.indexOf(step);
    if (currentIndex < steps.length - 1) {
      const next = steps[currentIndex + 1];
      if (next === "discovery") {
        setStep(next);
        runDiscovery();
      } else {
        setStep(next);
      }
    } else {
      startScan();
    }
  };

  const prevStep = () => {
    const steps: ScanStep[] = ["roots", "discovery", "policy"];
    const currentIndex = steps.indexOf(step);
    if (currentIndex > 0) {
      setStep(steps[currentIndex - 1]);
    }
  };

  return (
    <div className="flex-1">
      <div className="p-4 sm:p-6 max-w-4xl mx-auto">
        {step !== "running" && step !== "complete" && (
          <nav aria-label="Scan progress" className="flex justify-center items-center gap-2 mb-8">
            {[
              { key: "roots", label: "Scan Roots" },
              { key: "discovery", label: "Discovery" },
              { key: "policy", label: "Policy" },
            ].map((s, i) => {
              const stepIndex = ["roots", "discovery", "policy"].indexOf(step);
              const isComplete = stepIndex > i;
              const isCurrent = step === s.key;

              return (
                <div key={s.key} className="flex items-center">
                  <div
                    aria-current={isCurrent ? "step" : undefined}
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                      isCurrent
                        ? "bg-accent text-accent-foreground"
                        : isComplete
                          ? "bg-accent/50 text-accent-foreground"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {isComplete ? <Check className="w-4 h-4" /> : i + 1}
                  </div>
                  <span className="ml-2 text-sm hidden sm:inline">{s.label}</span>
                  {i < 2 && <ChevronRight className="w-4 h-4 mx-2 text-muted-foreground" />}
                </div>
              );
            })}
          </nav>
        )}

        <AnimatePresence mode="wait">{renderStep()}</AnimatePresence>

        {step !== "running" && step !== "complete" && (
          <div className="flex justify-between mt-6">
            <Button variant="outline" onClick={prevStep} disabled={step === "roots"}>
              <ChevronLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <Button onClick={nextStep} disabled={!canProceed()}>
              {step === "policy" ? (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Start Scan
                </>
              ) : (
                <>
                  Next
                  <ChevronRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
