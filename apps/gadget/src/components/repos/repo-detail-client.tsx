"use client";

import { useSessionStream } from "@devkit/hooks";
import { cn } from "@devkit/ui";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@devkit/ui/components/alert-dialog";
import { Badge } from "@devkit/ui/components/badge";
import { Button } from "@devkit/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@devkit/ui/components/card";
import { Checkbox } from "@devkit/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@devkit/ui/components/dialog";
import { Input } from "@devkit/ui/components/input";
import { Label } from "@devkit/ui/components/label";
import { Progress } from "@devkit/ui/components/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@devkit/ui/components/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@devkit/ui/components/sheet";
import { Switch } from "@devkit/ui/components/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@devkit/ui/components/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@devkit/ui/components/tooltip";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock,
  ExternalLink,
  Eye,
  FolderGit2,
  GitBranch,
  GitBranchPlus,
  Github,
  Globe,
  Info,
  Loader2,
  Lock,
  Package,
  Pencil,
  Plus,
  ScanSearch,
  Settings,
  ShieldCheck,
  Trash2,
  Undo2,
  X,
  Zap,
} from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { CodeTabContent } from "@/components/code/code-tab-content";
import { AIFileGenTerminal, useAIFileGen } from "@/components/repos/ai-file-gen-terminal";
import { ClaudeTabContent } from "@/components/repos/claude-tab-content";
import { ManualFindingForm, type ManualFindingFormData } from "@/components/repos/manual-finding-form";
import { GitHubTabContent } from "@/components/repos/repo-github-content";
import { RepoIntegrationsContent } from "@/components/repos/repo-integrations-content";
import { QuickImproveDropdown, QuickImproveTerminal, useQuickImprove } from "@/components/repos/repo-quick-improve";
import { SessionTerminal } from "@/components/sessions/session-terminal";
import { useTabNavigation } from "@/hooks/use-tab-navigation";
import {
  createManualFinding,
  deleteManualFinding,
  resolveManualFinding,
  unresolveManualFinding,
  updateManualFinding,
} from "@/lib/actions/manual-findings";
import type { GitHubAccount } from "@/lib/actions/repos";
import { deleteRepos, getGitHubAccountsForRemote, readRepoFile, setupGitHubRemote } from "@/lib/actions/repos";
import { classifyFinding } from "@/lib/services/finding-classifier";
import type {
  AIFile,
  CodeBranch,
  CodeTreeEntry,
  Concept,
  ConceptLinkWithConcept,
  Finding,
  ManualFinding,
  Repo,
  RepoWithCounts,
} from "@/lib/types";
import { formatNumber, timeAgo } from "@/lib/utils";

interface RepoDetailClientProps {
  repo: RepoWithCounts;
  findings: Finding[];
  aiFiles: AIFile[];
  claudeConfig?: {
    settingsJson: string | null;
    claudeMd: string | null;
    repoPath: string;
  };
  defaultClaudeSettings?: string | null;
  concepts?: Concept[];
  linkedConcepts?: ConceptLinkWithConcept[];
  repos?: Pick<Repo, "id" | "name" | "local_path">[];
  manualFindings?: ManualFinding[];
  codeBranches?: CodeBranch[];
  codeRootDir?: CodeTreeEntry[];
  codeReadme?: string | null;
  hasGitHubPat?: boolean;
}

export function RepoDetailClient({
  repo,
  findings,
  aiFiles,
  claudeConfig,
  defaultClaudeSettings,
  concepts = [],
  linkedConcepts = [],
  repos = [],
  manualFindings = [],
  codeBranches = [],
  codeRootDir = [],
  codeReadme,
  hasGitHubPat: patAvailable = false,
}: RepoDetailClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { activeTab, setActiveTab } = useTabNavigation(
    "overview",
    pathname || "",
    {
      overview: "Overview",
      code: "Code",
      findings: "Findings",
      "ai-files": "AI Files",
      "ai-config": "AI Config",
      "ai-integrations": "AI Integrations",
      github: "GitHub",
    },
    repo.name,
    { "ai-fixes": "ai-files", "fix-plan": "ai-files" },
  );

  // Delete state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [alsoTrash, setAlsoTrash] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      if (alsoTrash && repo.local_path) {
        const res = await fetch(`/api/repos/${repo.id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Failed to move to Trash");
      } else {
        await deleteRepos([repo.id]);
      }
      toast.success(`Removed ${repo.name}`);
      router.push("/repositories");
    } catch {
      toast.error("Failed to remove repository");
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
      setAlsoTrash(false);
    }
  };

  // Rescan state
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanPhase, setScanPhase] = useState("");
  const [scanSessionId, setScanSessionId] = useState<string | null>(null);

  useSessionStream({
    sessionId: scanSessionId,
    onEvent: (event) => {
      if (event.progress !== undefined) setScanProgress(event.progress);
      if (event.phase) setScanPhase(event.phase);
    },
    onComplete: (event) => {
      setScanSessionId(null);
      setIsScanning(false);
      setScanProgress(0);
      setScanPhase("");
      if (event.type === "done") {
        router.refresh();
      }
    },
  });

  // Quick Improve — hook manages multi-session state, recovery, personas
  const {
    sessions: improveSessions,
    expandedId: improveExpandedId,
    isImproving,
    handleQuickImprove,
    dismissSession: dismissImproveSession,
    toggleExpand: toggleImproveExpand,
    markRunning: markImproveRunning,
  } = useQuickImprove(repo);

  const handleRescan = useCallback(async () => {
    if (isScanning) return;
    setIsScanning(true);
    setScanProgress(0);
    setScanPhase("Starting scan...");

    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "scan",
          label: `Scan: ${repo.name}`,
          contextType: "repo",
          contextId: repo.id,
          contextName: repo.name,
          metadata: {
            scanRoots: [repo.local_path],
            selectedRepoPaths: [repo.local_path],
            policyId: null,
            autoMatch: true,
          },
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Scan request failed");
      }

      const { sessionId } = await res.json();
      setScanSessionId(sessionId);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Scan failed";
      toast.error(message);
      setIsScanning(false);
      setScanProgress(0);
      setScanPhase("");
    }
  }, [isScanning, repo.id, repo.name, repo.local_path]);

  const [findingsFilter, setFindingsFilter] = useState<string>("all");
  const [selectedAIFiles, setSelectedAIFiles] = useState<Set<string>>(new Set());
  const [whyFlaggedOpen, setWhyFlaggedOpen] = useState(false);
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null);
  const [viewingAIFile, setViewingAIFile] = useState<AIFile | null>(null);
  const [viewingFileContent, setViewingFileContent] = useState<string | null>(null);
  const [viewingFileLoading, setViewingFileLoading] = useState(false);

  // AI file generation — session-based terminals
  const {
    sessions: genSessions,
    expandedId: genExpandedId,
    fileStatuses,
    anyGenerating,
    generateFiles,
    dismissSession: dismissGenSession,
    toggleExpand: toggleGenExpand,
    updateFileStatus,
  } = useAIFileGen(repo);

  // Findings auto-fix state — session-based
  const [dismissedFindingIds, setDismissedFindingIds] = useState<Set<string>>(new Set());
  const [selectedFindingIds, setSelectedFindingIds] = useState<Set<string>>(new Set());
  const [fixSessionId, setFixSessionId] = useState<string | null>(null);
  const fixSession = useSessionStream({
    sessionId: fixSessionId,
    onComplete: () => {
      router.refresh();
    },
  });
  const anyFixing = fixSession.status === "streaming" || fixSession.status === "connecting";

  const aiFileScore =
    aiFiles.length > 0 ? Math.round((aiFiles.filter((f) => f.present).length / aiFiles.length) * 100) : 0;

  const toggleAIFile = (path: string) => {
    setSelectedAIFiles((prev) => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });
  };

  const selectableAIFiles = aiFiles;
  const allSelected = selectableAIFiles.length > 0 && selectableAIFiles.every((f) => selectedAIFiles.has(f.path));

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedAIFiles(new Set());
    } else {
      setSelectedAIFiles(new Set(selectableAIFiles.map((f) => f.path)));
    }
  };

  const handleUpdateSelected = useCallback(async () => {
    const filesToProcess = aiFiles.filter((f) => selectedAIFiles.has(f.path));
    if (filesToProcess.length === 0) return;

    setSelectedAIFiles(new Set());
    await generateFiles(filesToProcess);
  }, [selectedAIFiles, aiFiles, generateFiles]);

  const handleViewFile = useCallback(
    async (file: AIFile) => {
      setViewingAIFile(file);
      setViewingFileContent(null);
      setViewingFileLoading(true);
      try {
        const result = await readRepoFile(repo.id, file.path);
        setViewingFileContent(result.content);
        if (result.error) toast.error(result.error);
      } catch {
        toast.error("Failed to read file");
      } finally {
        setViewingFileLoading(false);
      }
    },
    [repo.id],
  );

  // Findings dismiss/select helpers
  const visibleFindings = findings.filter((f) => !dismissedFindingIds.has(f.id));
  const dismissedCount = dismissedFindingIds.size;

  const toggleFindingSelection = (id: string) => {
    setSelectedFindingIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAllFixable = () => {
    const fixableIds = visibleFindings.filter((f) => classifyFinding(f).autoFixable).map((f) => f.id);
    setSelectedFindingIds(new Set(fixableIds));
  };

  const dismissSelected = () => {
    setDismissedFindingIds((prev) => {
      const next = new Set(prev);
      for (const id of selectedFindingIds) next.add(id);
      return next;
    });
    setSelectedFindingIds(new Set());
  };

  const undoDismiss = () => {
    setDismissedFindingIds(new Set());
  };

  const handleAutoFix = useCallback(async () => {
    const ids = [...selectedFindingIds];
    if (ids.length === 0) return;
    setSelectedFindingIds(new Set());

    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "finding_fix",
          label: `Finding Fix for ${repo.name}`,
          contextType: "repo",
          contextId: repo.id,
          contextName: repo.name,
          metadata: { findingIds: ids, repoId: repo.id },
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to start session");
      }

      const { sessionId } = await res.json();
      setFixSessionId(sessionId);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Auto-fix failed";
      toast.error(message);
    }
  }, [selectedFindingIds, repo.id, repo.name]);

  // Manual findings state
  const [manualFindingFormOpen, setManualFindingFormOpen] = useState(false);
  const [editingManualFinding, setEditingManualFinding] = useState<ManualFinding | undefined>(undefined);
  const [isManualSubmitting, setIsManualSubmitting] = useState(false);
  const [showResolved, setShowResolved] = useState(false);

  const unresolvedManualFindings = manualFindings.filter((f) => !f.is_resolved);
  const resolvedManualFindings = manualFindings.filter((f) => f.is_resolved);

  const handleManualFindingSubmit = async (data: ManualFindingFormData) => {
    setIsManualSubmitting(true);
    try {
      if (editingManualFinding) {
        await updateManualFinding(editingManualFinding.id, data);
        toast.success("Finding updated");
      } else {
        await createManualFinding({ repo_id: repo.id, ...data });
        toast.success("Finding added");
      }
      setManualFindingFormOpen(false);
      setEditingManualFinding(undefined);
      router.refresh();
    } catch {
      toast.error("Failed to save finding");
    } finally {
      setIsManualSubmitting(false);
    }
  };

  const handleResolveManualFinding = async (id: string) => {
    try {
      await resolveManualFinding(id);
      toast.success("Finding resolved");
      router.refresh();
    } catch {
      toast.error("Failed to resolve finding");
    }
  };

  const handleUnresolveManualFinding = async (id: string) => {
    try {
      await unresolveManualFinding(id);
      router.refresh();
    } catch {
      toast.error("Failed to unresolve finding");
    }
  };

  const handleDeleteManualFinding = async (id: string) => {
    try {
      await deleteManualFinding(id);
      toast.success("Finding deleted");
      router.refresh();
    } catch {
      toast.error("Failed to delete finding");
    }
  };

  // GitHub remote setup state
  const [showRemoteDialog, setShowRemoteDialog] = useState(false);
  const [remoteAccounts, setRemoteAccounts] = useState<GitHubAccount[]>([]);
  const [remoteAccountsLoading, setRemoteAccountsLoading] = useState(false);
  const [remoteOwner, setRemoteOwner] = useState("");
  const [remoteRepoName, setRemoteRepoName] = useState(repo.name);
  const [remoteDescription, setRemoteDescription] = useState("");
  const [remoteIsPrivate, setRemoteIsPrivate] = useState(true);
  const [remoteCreating, setRemoteCreating] = useState(false);

  const openRemoteDialog = useCallback(async () => {
    setShowRemoteDialog(true);
    setRemoteRepoName(repo.name);
    setRemoteDescription("");
    setRemoteIsPrivate(true);
    setRemoteAccountsLoading(true);
    try {
      const accounts = await getGitHubAccountsForRemote();
      setRemoteAccounts(accounts);
      if (accounts.length > 0) setRemoteOwner(accounts[0].login);
    } catch {
      toast.error("Failed to load GitHub accounts");
    } finally {
      setRemoteAccountsLoading(false);
    }
  }, [repo.name]);

  const handleCreateRemote = useCallback(async () => {
    if (!remoteRepoName.trim() || !remoteOwner) return;
    setRemoteCreating(true);

    const selectedAccount = remoteAccounts.find((a) => a.login === remoteOwner);

    try {
      const result = await setupGitHubRemote({
        repoId: repo.id,
        name: remoteRepoName.trim(),
        description: remoteDescription.trim() || undefined,
        isPrivate: remoteIsPrivate,
        org: selectedAccount?.type === "org" ? remoteOwner : undefined,
      });

      if (result.success) {
        toast.success(
          <span>
            GitHub repository created!{" "}
            <a href={result.githubUrl} target="_blank" rel="noopener noreferrer" className="underline">
              View on GitHub
            </a>
          </span>,
        );
        setShowRemoteDialog(false);
        router.refresh();
      } else {
        toast.error(result.error || "Failed to create repository");
      }
    } catch {
      toast.error("Failed to create GitHub repository");
    } finally {
      setRemoteCreating(false);
    }
  }, [remoteRepoName, remoteOwner, remoteDescription, remoteIsPrivate, remoteAccounts, repo.id, router]);

  const openWhyFlagged = (finding: Finding) => {
    setSelectedFinding(finding);
    setWhyFlaggedOpen(true);
  };

  const severityIcon = (severity: string) => {
    switch (severity) {
      case "critical":
        return <AlertTriangle className="w-4 h-4 text-destructive" />;
      case "warning":
        return <AlertTriangle className="w-4 h-4 text-warning" />;
      default:
        return <Info className="w-4 h-4 text-info" />;
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <nav className="flex items-center gap-1.5 text-sm text-muted-foreground mb-4">
          <Link href="/repositories" className="hover:text-foreground transition-colors">
            Repos
          </Link>
          <span>/</span>
          <span className="text-foreground font-medium truncate">{repo.name}</span>
        </nav>
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-3 flex-wrap">
              {repo.name}
              {repo.repo_type && (
                <Badge variant="outline" className="capitalize font-normal">
                  {repo.repo_type}
                </Badge>
              )}
            </h1>
            <p className="text-muted-foreground font-mono text-sm mt-1 truncate">{repo.local_path}</p>
          </div>
          <div className="flex gap-2 shrink-0 items-center">
            {isScanning && (
              <span className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                {scanPhase || "Scanning..."}
              </span>
            )}
            <Button size="sm" variant="outline" disabled={isScanning || isImproving} onClick={handleRescan}>
              <ScanSearch className="w-4 h-4 mr-1.5" />
              Re-scan
            </Button>
            <QuickImproveDropdown onSelect={handleQuickImprove} disabled={isScanning} hasRemote={!!repo.git_remote} />
            <Button
              size="sm"
              variant="outline"
              className="text-destructive border-destructive/30 hover:bg-destructive/10"
              disabled={isScanning || isImproving}
              onClick={() => setShowDeleteDialog(true)}
            >
              <Trash2 className="w-4 h-4 mr-1.5" />
              Remove
            </Button>
          </div>
        </div>
        {isScanning && <Progress value={scanProgress} className="mt-3 h-2" />}
        {improveSessions.length > 0 && (
          <div className="space-y-2">
            {improveSessions.map((s) => (
              <QuickImproveTerminal
                key={s.id}
                sessionId={s.id}
                persona={s.persona}
                minimized={improveExpandedId !== s.id}
                onToggleMinimize={() => toggleImproveExpand(s.id)}
                onDismiss={() => dismissImproveSession(s.id)}
                onMarkRunning={(running) => markImproveRunning(s.id, running)}
                onRetry={() => handleQuickImprove(s.persona)}
              />
            ))}
          </div>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="w-full justify-start overflow-x-auto flex-nowrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="code">
            <FolderGit2 className="w-4 h-4 mr-1.5" />
            Code
          </TabsTrigger>
          <TabsTrigger value="findings">
            Findings
            {findings.length > 0 && (
              <Badge variant="destructive" className="ml-1.5 h-5 px-1.5">
                {formatNumber(findings.length)}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="ai-files">
            AI Files
            {aiFiles.filter((f) => !f.present).length > 0 && (
              <Badge variant="secondary" className="ml-1.5 h-5 px-1.5">
                {formatNumber(aiFiles.filter((f) => !f.present).length)} missing
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="ai-config">AI Config</TabsTrigger>
          <TabsTrigger value="ai-integrations">
            AI Integrations
            {concepts.length + linkedConcepts.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 h-5 px-1.5">
                {formatNumber(concepts.length + linkedConcepts.length)}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="github">
            <Github className="w-4 h-4 mr-1.5" />
            GitHub
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview">
          <div className="grid lg:grid-cols-3 gap-4 sm:gap-6">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Repository Info</CardTitle>
              </CardHeader>
              <CardContent className="grid sm:grid-cols-2 gap-4">
                <div className="flex items-center gap-3">
                  <Package className="w-5 h-5 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-sm text-muted-foreground">Package Manager</p>
                    <p className="font-medium capitalize">{repo.package_manager || "Unknown"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <GitBranch className="w-5 h-5 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-sm text-muted-foreground">Default Branch</p>
                    <p className="font-medium">{codeBranches.find((b) => b.isDefault)?.name || repo.default_branch}</p>
                  </div>
                </div>
                {(() => {
                  const currentBranch = codeBranches.find((b) => b.isCurrent)?.name;
                  const defaultBranch = codeBranches.find((b) => b.isDefault)?.name || repo.default_branch;
                  if (currentBranch && currentBranch !== defaultBranch) {
                    return (
                      <div className="flex items-center gap-3">
                        <GitBranchPlus className="w-5 h-5 text-primary shrink-0" />
                        <div>
                          <p className="text-sm text-muted-foreground">Current Branch</p>
                          <p className="font-medium text-primary">{currentBranch}</p>
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}
                <div className="flex items-center gap-3">
                  <Clock className="w-5 h-5 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-sm text-muted-foreground">Last Modified</p>
                    <p className="font-medium">{repo.last_modified_at ? timeAgo(repo.last_modified_at) : "Unknown"}</p>
                  </div>
                </div>
                {repo.git_remote ? (
                  <div className="flex items-center gap-3 sm:col-span-2">
                    <ExternalLink className="w-5 h-5 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm text-muted-foreground">Remote</p>
                      <a
                        href={repo.git_remote}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-primary hover:underline truncate block"
                      >
                        {repo.git_remote}
                      </a>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 sm:col-span-2">
                    <Github className="w-5 h-5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-muted-foreground">Remote</p>
                      <p className="text-sm text-muted-foreground italic">No remote configured</p>
                    </div>
                    {patAvailable ? (
                      <Button size="sm" variant="outline" onClick={openRemoteDialog}>
                        <Github className="w-4 h-4 mr-1.5" />
                        Create GitHub Repo
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" asChild>
                        <Link href="/settings">
                          <Settings className="w-4 h-4 mr-1.5" />
                          Configure Token
                        </Link>
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Findings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-destructive" />
                    Critical
                  </span>
                  <span className="font-bold">{formatNumber(repo.critical_count)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-warning" />
                    Warnings
                  </span>
                  <span className="font-bold">{formatNumber(repo.warning_count)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-info" />
                    Info
                  </span>
                  <span className="font-bold">{formatNumber(repo.info_count)}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Code Tab */}
        <TabsContent value="code">
          <CodeTabContent
            repoId={repo.id}
            repoName={repo.name}
            repoPath={repo.local_path}
            branches={codeBranches}
            rootEntries={codeRootDir}
            readme={codeReadme ?? null}
          />
        </TabsContent>

        {/* Findings Tab (merged Dependencies + Structure) */}
        <TabsContent value="findings">
          <div className="space-y-4">
            {/* Category filter chips */}
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { key: "all", label: "All", count: visibleFindings.length },
                  {
                    key: "dependencies",
                    label: "Dependencies",
                    count: visibleFindings.filter((f) => f.category === "dependencies").length,
                  },
                  {
                    key: "structure",
                    label: "Structure",
                    count: visibleFindings.filter((f) => f.category === "structure").length,
                  },
                  {
                    key: "ai-files",
                    label: "AI Files",
                    count: visibleFindings.filter((f) => f.category === "ai-files").length,
                  },
                  {
                    key: "config",
                    label: "Config",
                    count: visibleFindings.filter((f) => f.category === "config").length,
                  },
                  {
                    key: "custom",
                    label: "Custom",
                    count:
                      visibleFindings.filter((f) => f.category === "custom").length + unresolvedManualFindings.length,
                  },
                ] as const
              ).map((chip) => (
                <Button
                  key={chip.key}
                  variant={findingsFilter === chip.key ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFindingsFilter(chip.key)}
                  className="gap-1.5"
                >
                  {chip.label}
                  {chip.count > 0 && (
                    <Badge
                      variant={findingsFilter === chip.key ? "secondary" : "outline"}
                      className="h-5 px-1.5 text-[10px]"
                    >
                      {formatNumber(chip.count)}
                    </Badge>
                  )}
                </Button>
              ))}
            </div>

            {/* Toolbar row */}
            <div className="flex items-center gap-3 flex-wrap">
              <Button variant="outline" size="sm" onClick={selectAllFixable} disabled={anyFixing}>
                <div
                  aria-hidden="true"
                  className={cn(
                    "mr-1.5 h-4 w-4 shrink-0 rounded-xs border border-accent-foreground/30 ring-offset-background",
                    visibleFindings.filter((f) => classifyFinding(f).autoFixable).length > 0 &&
                      visibleFindings
                        .filter((f) => classifyFinding(f).autoFixable)
                        .every((f) => selectedFindingIds.has(f.id))
                      ? "bg-accent text-accent-foreground"
                      : "",
                  )}
                >
                  {visibleFindings.filter((f) => classifyFinding(f).autoFixable).length > 0 &&
                    visibleFindings
                      .filter((f) => classifyFinding(f).autoFixable)
                      .every((f) => selectedFindingIds.has(f.id)) && <Check className="h-3.5 w-3.5 text-current" />}
                </div>
                Select all fixable
              </Button>
              {selectedFindingIds.size > 0 && (
                <span className="text-sm text-muted-foreground">{selectedFindingIds.size} selected</span>
              )}
              <Button
                size="sm"
                onClick={handleAutoFix}
                disabled={selectedFindingIds.size === 0 || anyFixing}
                className="gap-1.5"
              >
                {anyFixing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                Auto-fix Selected
              </Button>
              {selectedFindingIds.size > 0 && (
                <Button variant="outline" size="sm" onClick={dismissSelected} className="gap-1.5">
                  <X className="w-4 h-4" />
                  Dismiss Selected
                </Button>
              )}
              {dismissedCount > 0 && (
                <button
                  type="button"
                  onClick={undoDismiss}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                  Show {dismissedCount} dismissed
                </button>
              )}
              <div className="ml-auto">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditingManualFinding(undefined);
                    setManualFindingFormOpen(true);
                  }}
                >
                  <Plus className="w-4 h-4 mr-1.5" />
                  Add Finding
                </Button>
              </div>
            </div>

            {/* Fix terminal */}
            {fixSessionId && (
              <SessionTerminal
                logs={fixSession.logs}
                progress={fixSession.progress}
                phase={fixSession.phase}
                status={fixSession.status}
                error={fixSession.error}
                elapsed={fixSession.elapsed}
                onCancel={fixSession.cancel}
                onDismiss={() => setFixSessionId(null)}
                variant="compact"
              />
            )}

            <Card>
              <CardHeader>
                <CardTitle>Findings</CardTitle>
                <CardDescription>
                  {findingsFilter === "all"
                    ? "All issues detected across categories"
                    : `Issues in ${findingsFilter} category`}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <TooltipProvider>
                  {visibleFindings
                    .filter((f) => {
                      if (findingsFilter === "all") return true;
                      return f.category === findingsFilter;
                    })
                    .map((finding) => {
                      const classification = classifyFinding(finding);
                      const isSelected = selectedFindingIds.has(finding.id);

                      return (
                        <motion.div
                          key={finding.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className={`p-3 sm:p-4 rounded-lg border transition-colors ${
                            isSelected
                              ? "border-primary/50 bg-primary/5"
                              : finding.severity === "critical"
                                ? "bg-destructive/5 border-destructive/20"
                                : finding.severity === "warning"
                                  ? "bg-warning/5 border-warning/20"
                                  : "bg-muted/50"
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            {/* Checkbox */}
                            {classification.autoFixable ? (
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => toggleFindingSelection(finding.id)}
                                disabled={anyFixing}
                                className="mt-0.5 shrink-0"
                              />
                            ) : (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="mt-0.5 shrink-0">
                                    <Checkbox disabled className="opacity-40" />
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="right">
                                  <p className="text-xs">{classification.reason || "Cannot be auto-fixed"}</p>
                                </TooltipContent>
                              </Tooltip>
                            )}
                            {severityIcon(finding.severity)}
                            {/* biome-ignore lint/a11y/noStaticElementInteractions: clickable detail area wraps interactive controls */}
                            <div
                              className="flex-1 min-w-0 cursor-pointer"
                              onClick={() => openWhyFlagged(finding)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") openWhyFlagged(finding);
                              }}
                            >
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <Badge variant="outline" className="capitalize text-xs">
                                  {finding.category}
                                </Badge>
                                <h4 className="font-medium">{finding.title}</h4>
                                <Badge
                                  variant={finding.severity === "critical" ? "destructive" : "secondary"}
                                  className="capitalize"
                                >
                                  {finding.severity}
                                </Badge>
                                {classification.autoFixable && (
                                  <Badge variant="outline" className="text-[10px] gap-1">
                                    <Zap className="w-3 h-3" />
                                    {classification.risk}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground">{finding.details}</p>
                              {finding.evidence && (
                                <p className="text-xs font-mono text-muted-foreground mt-2 truncate">
                                  {finding.evidence}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="hidden sm:inline-flex"
                                onClick={() => openWhyFlagged(finding)}
                              >
                                Why flagged?
                              </Button>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                    onClick={() => {
                                      setDismissedFindingIds((prev) => new Set([...prev, finding.id]));
                                      setSelectedFindingIds((prev) => {
                                        const next = new Set(prev);
                                        next.delete(finding.id);
                                        return next;
                                      });
                                    }}
                                  >
                                    <X className="w-4 h-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Dismiss</TooltipContent>
                              </Tooltip>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                </TooltipProvider>
                {visibleFindings.filter((f) => {
                  if (findingsFilter === "all") return true;
                  return f.category === findingsFilter;
                }).length === 0 &&
                  unresolvedManualFindings.length === 0 && (
                    <div className="text-center py-10 space-y-2">
                      <ShieldCheck className="w-8 h-8 text-success/60 mx-auto" />
                      <p className="text-muted-foreground">
                        {findingsFilter === "all"
                          ? "No issues found — this repo looks clean."
                          : `No ${findingsFilter} issues found.`}
                      </p>
                    </div>
                  )}
              </CardContent>
            </Card>

            {/* Manual Findings */}
            {(findingsFilter === "all" || findingsFilter === "custom") && unresolvedManualFindings.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Manual Findings</CardTitle>
                  <CardDescription>User-created findings that persist across re-scans</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <TooltipProvider>
                    {unresolvedManualFindings.map((mf) => (
                      <div
                        key={mf.id}
                        className={`p-3 sm:p-4 rounded-lg border ${
                          mf.severity === "critical"
                            ? "bg-destructive/5 border-destructive/20"
                            : mf.severity === "warning"
                              ? "bg-warning/5 border-warning/20"
                              : "bg-muted/50"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          {severityIcon(mf.severity)}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <Badge variant="outline" className="capitalize text-xs">
                                {mf.category}
                              </Badge>
                              <Badge variant="secondary" className="text-xs">
                                Manual
                              </Badge>
                              <h4 className="font-medium">{mf.title}</h4>
                              <Badge
                                variant={mf.severity === "critical" ? "destructive" : "secondary"}
                                className="capitalize"
                              >
                                {mf.severity}
                              </Badge>
                            </div>
                            {mf.details && <p className="text-sm text-muted-foreground">{mf.details}</p>}
                            {mf.evidence && (
                              <p className="text-xs font-mono text-muted-foreground mt-2 truncate">{mf.evidence}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => handleResolveManualFinding(mf.id)}
                                >
                                  <CheckCircle2 className="w-4 h-4 text-success" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Resolve</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => {
                                    setEditingManualFinding(mf);
                                    setManualFindingFormOpen(true);
                                  }}
                                >
                                  <Pencil className="w-4 h-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Edit</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                  onClick={() => handleDeleteManualFinding(mf.id)}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Delete</TooltipContent>
                            </Tooltip>
                          </div>
                        </div>
                      </div>
                    ))}
                  </TooltipProvider>
                </CardContent>
              </Card>
            )}

            {/* Show resolved toggle */}
            {(findingsFilter === "all" || findingsFilter === "custom") && resolvedManualFindings.length > 0 && (
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => setShowResolved(!showResolved)}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showResolved ? "Hide" : "Show"} {resolvedManualFindings.length} resolved finding
                  {resolvedManualFindings.length !== 1 ? "s" : ""}
                </button>
                {showResolved && (
                  <div className="space-y-3 mt-4">
                    {resolvedManualFindings.map((mf) => (
                      <div key={mf.id} className="p-3 rounded-lg border bg-muted/30 opacity-60">
                        <div className="flex items-start gap-3">
                          <CheckCircle2 className="w-4 h-4 text-success mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <h4 className="font-medium line-through">{mf.title}</h4>
                              <Badge variant="secondary" className="text-xs">
                                Resolved
                              </Badge>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => handleUnresolveManualFinding(mf.id)}
                            >
                              Unresolve
                            </Button>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                    onClick={() => handleDeleteManualFinding(mf.id)}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Delete</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </TabsContent>

        {/* AI Files Tab */}
        <TabsContent value="ai-files">
          <div className="grid lg:grid-cols-3 gap-4 sm:gap-6">
            <Card className="lg:col-span-2">
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <CardTitle>AI Assistant Files</CardTitle>
                    <CardDescription>Files that help AI assistants understand your project</CardDescription>
                  </div>
                  {selectableAIFiles.length > 0 && (
                    <Button
                      size="sm"
                      onClick={handleUpdateSelected}
                      disabled={selectedAIFiles.size === 0 || anyGenerating}
                    >
                      {anyGenerating ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Pencil className="w-4 h-4 mr-2" />
                      )}
                      Generate Selected ({selectedAIFiles.size})
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {genSessions.length > 0 && (
                  <div className="space-y-2 mb-4">
                    {genSessions.map((s) => (
                      <AIFileGenTerminal
                        key={s.id}
                        sessionId={s.id}
                        fileName={s.fileName}
                        minimized={genExpandedId !== s.id}
                        onToggleMinimize={() => toggleGenExpand(s.id)}
                        onDismiss={() => dismissGenSession(s.id)}
                        onStatusChange={(status) => updateFileStatus(s.fileName, status)}
                      />
                    ))}
                  </div>
                )}
                {selectableAIFiles.length > 0 && (
                  <div className="flex items-center gap-2 pb-2 border-b">
                    <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} disabled={anyGenerating} />
                    <span className="text-sm text-muted-foreground">Select all</span>
                  </div>
                )}
                {aiFiles.map((file) => {
                  const fileStatus = fileStatuses.get(file.path);
                  const isGenerating = !!fileStatus?.generating;
                  const isSelected = selectedAIFiles.has(file.path);

                  return (
                    // biome-ignore lint/a11y/noStaticElementInteractions: clickable row wraps Checkbox — can't use <button> (nested button) or role="button" (useSemanticElements)
                    <div
                      key={file.path}
                      className={`flex items-center gap-3 sm:gap-4 p-3 rounded-lg border transition-colors cursor-pointer text-left w-full ${
                        isGenerating
                          ? "bg-primary/5 border-primary/30"
                          : fileStatus?.done === "success"
                            ? "bg-success/5 border-success/20"
                            : fileStatus?.done === "error"
                              ? "bg-destructive/5 border-destructive/20"
                              : isSelected
                                ? "border-primary/50 bg-primary/5"
                                : file.present
                                  ? "bg-success/5 border-success/20"
                                  : "bg-muted/50"
                      }`}
                      onClick={() => {
                        if (!isGenerating && !fileStatus?.done && !anyGenerating) toggleAIFile(file.path);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          if (!isGenerating && !fileStatus?.done && !anyGenerating) toggleAIFile(file.path);
                        }
                      }}
                    >
                      {isGenerating ? (
                        <Loader2 className="w-5 h-5 text-primary shrink-0 animate-spin" />
                      ) : fileStatus?.done === "success" ? (
                        <Check className="w-5 h-5 text-success shrink-0" />
                      ) : fileStatus?.done === "error" ? (
                        <X className="w-5 h-5 text-destructive shrink-0" />
                      ) : (
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleAIFile(file.path)}
                          disabled={anyGenerating}
                          onClick={(e) => e.stopPropagation()}
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm sm:text-base">{file.name}</p>
                        {isGenerating && fileStatus.statusText ? (
                          <p className="text-xs sm:text-sm text-primary font-medium truncate">
                            {fileStatus.statusText}
                          </p>
                        ) : fileStatus?.done === "skipped" ? (
                          <p className="text-xs sm:text-sm text-muted-foreground truncate">
                            Skipped — updated recently
                          </p>
                        ) : (
                          <p className="text-xs sm:text-sm text-muted-foreground font-mono truncate">{file.path}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {!isGenerating && !fileStatus?.done && file.present && file.quality !== undefined && (
                          <>
                            <Progress value={file.quality} className="w-16 sm:w-20 h-2" />
                            <span className="text-xs sm:text-sm text-muted-foreground">{file.quality}%</span>
                          </>
                        )}
                        {!isGenerating && !fileStatus?.done && !file.present && (
                          <Badge variant="outline" className="text-xs text-muted-foreground">
                            Missing
                          </Badge>
                        )}
                        {file.present && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleViewFile(file);
                                  }}
                                >
                                  <Eye className="w-4 h-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>View file</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <div className="space-y-4 sm:space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Coverage</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center">
                    <div className="relative w-28 h-28 sm:w-32 sm:h-32 mx-auto mb-4">
                      <svg
                        className="w-full h-full -rotate-90"
                        viewBox="0 0 128 128"
                        aria-label={`AI file coverage: ${aiFileScore}%`}
                        role="img"
                      >
                        <circle
                          cx="64"
                          cy="64"
                          r="56"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="12"
                          className="text-muted"
                        />
                        <circle
                          cx="64"
                          cy="64"
                          r="56"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="12"
                          strokeDasharray={`${aiFileScore * 3.52} 352`}
                          className="text-primary"
                        />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-2xl sm:text-3xl font-bold">{aiFileScore}%</span>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {formatNumber(aiFiles.filter((f) => f.present).length)} of {formatNumber(aiFiles.length)} files
                      present
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* AI Config Tab (Settings + CLAUDE.md) */}
        <TabsContent value="ai-config">
          <ClaudeTabContent
            repoId={repo.id}
            claudeConfig={claudeConfig}
            defaultClaudeSettings={defaultClaudeSettings}
            onSaved={() => router.refresh()}
          />
        </TabsContent>

        {/* AI Integrations Tab */}
        <TabsContent value="ai-integrations">
          <RepoIntegrationsContent repoId={repo.id} concepts={concepts} linkedConcepts={linkedConcepts} repos={repos} />
        </TabsContent>

        {/* GitHub Tab */}
        <TabsContent value="github">
          <GitHubTabContent repoId={repo.id} gitRemote={repo.git_remote} hasGitHubPat={patAvailable} />
        </TabsContent>
      </Tabs>

      {/* View AI File Drawer */}
      <Sheet open={!!viewingAIFile} onOpenChange={(open) => !open && setViewingAIFile(null)}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{viewingAIFile?.name}</SheetTitle>
            <SheetDescription className="font-mono text-xs">{viewingAIFile?.path}</SheetDescription>
          </SheetHeader>
          <div className="mt-4">
            {viewingFileLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading...
              </div>
            ) : viewingFileContent ? (
              <pre className="text-sm bg-muted p-4 rounded-lg font-mono overflow-auto max-h-[70vh] whitespace-pre-wrap">
                {viewingFileContent}
              </pre>
            ) : (
              <p className="text-sm text-muted-foreground py-8 text-center">File is empty or could not be read.</p>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Manual Finding Form */}
      <ManualFindingForm
        key={editingManualFinding?.id || "new"}
        open={manualFindingFormOpen}
        onOpenChange={setManualFindingFormOpen}
        initialData={editingManualFinding}
        onSubmit={handleManualFindingSubmit}
        isSubmitting={isManualSubmitting}
      />

      {/* Why Flagged Drawer */}
      <Sheet open={whyFlaggedOpen} onOpenChange={setWhyFlaggedOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Why was this flagged?</SheetTitle>
            <SheetDescription>{selectedFinding?.title}</SheetDescription>
          </SheetHeader>
          {selectedFinding && (
            <div className="mt-6 space-y-4">
              <div>
                <h4 className="text-sm font-medium mb-2">Details</h4>
                <p className="text-sm text-muted-foreground">{selectedFinding.details}</p>
              </div>
              {selectedFinding.evidence && (
                <div>
                  <h4 className="text-sm font-medium mb-2">Evidence</h4>
                  <pre className="text-sm bg-muted p-3 rounded-lg font-mono overflow-x-auto">
                    {selectedFinding.evidence}
                  </pre>
                </div>
              )}
              <div>
                <h4 className="text-sm font-medium mb-2">Suggested Actions</h4>
                <ul className="space-y-2">
                  {selectedFinding.suggested_actions.map((action) => (
                    <li key={action} className="flex items-center gap-2 text-sm">
                      <Check className="w-4 h-4 text-success" />
                      {action}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Create GitHub Repo Dialog */}
      <Dialog open={showRemoteDialog} onOpenChange={setShowRemoteDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create GitHub Repository</DialogTitle>
            <DialogDescription>Create a new GitHub repository and push your code.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="remote-owner">Account</Label>
              {remoteAccountsLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading accounts...
                </div>
              ) : remoteAccounts.length > 0 ? (
                <Select value={remoteOwner} onValueChange={setRemoteOwner}>
                  <SelectTrigger id="remote-owner">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {remoteAccounts.map((account) => (
                      <SelectItem key={account.login} value={account.login}>
                        {account.login} {account.type === "org" ? "(org)" : "(personal)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm text-muted-foreground">No GitHub accounts found.</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="remote-name">Repository Name</Label>
              <Input
                id="remote-name"
                value={remoteRepoName}
                onChange={(e) => setRemoteRepoName(e.target.value)}
                placeholder="my-repo"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="remote-desc">Description (optional)</Label>
              <Input
                id="remote-desc"
                value={remoteDescription}
                onChange={(e) => setRemoteDescription(e.target.value)}
                placeholder="A short description"
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {remoteIsPrivate ? (
                  <Lock className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <Globe className="w-4 h-4 text-muted-foreground" />
                )}
                <Label htmlFor="remote-visibility">{remoteIsPrivate ? "Private" : "Public"}</Label>
              </div>
              <Switch
                id="remote-visibility"
                checked={!remoteIsPrivate}
                onCheckedChange={(checked) => setRemoteIsPrivate(!checked)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRemoteDialog(false)} disabled={remoteCreating}>
              Cancel
            </Button>
            <Button onClick={handleCreateRemote} disabled={remoteCreating || !remoteRepoName.trim() || !remoteOwner}>
              {remoteCreating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  Creating & Pushing...
                </>
              ) : (
                <>
                  <Github className="w-4 h-4 mr-1.5" />
                  Create & Push
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog
        open={showDeleteDialog}
        onOpenChange={(open) => {
          setShowDeleteDialog(open);
          if (!open) setAlsoTrash(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {repo.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {alsoTrash
                ? "This will untrack the repository and move the directory to Trash."
                : "This will untrack the repository from Gadget. Your files on disk will not be affected."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {repo.local_path && (
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input
                type="checkbox"
                checked={alsoTrash}
                onChange={(e) => setAlsoTrash(e.target.checked)}
                className="rounded border-border"
              />
              Also move directory to Trash
            </label>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Removing..." : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
