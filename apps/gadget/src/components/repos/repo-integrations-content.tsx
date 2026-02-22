"use client";

import { Badge } from "@claudekit/ui/components/badge";
import { Button } from "@claudekit/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@claudekit/ui/components/card";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@claudekit/ui/components/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@claudekit/ui/components/tooltip";
import {
  ArrowRight,
  Bot,
  Eye,
  Link2,
  Puzzle,
  RefreshCw,
  Server,
  Share2,
  Sparkles,
  Terminal,
  Unlink,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { InstallConceptDialog } from "@/components/concepts/install-concept-dialog";
import { AddFromLibraryDialog } from "@/components/repos/add-from-library-dialog";
import { syncAllConceptsToRepo, syncConceptToRepo, unlinkConcept } from "@/lib/actions/concepts";
import { CONCEPT_TYPE_LABELS, CONCEPT_TYPE_SINGULAR } from "@/lib/constants";
import type { Concept, ConceptLinkWithConcept, Repo } from "@/lib/types";
import { formatNumber } from "@/lib/utils";

const CONCEPT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  skill: Sparkles,
  hook: Zap,
  command: Terminal,
  agent: Bot,
  mcp_server: Server,
  plugin: Puzzle,
};

interface RepoIntegrationsContentProps {
  repoId: string;
  concepts: Concept[];
  linkedConcepts: ConceptLinkWithConcept[];
  repos: Pick<Repo, "id" | "name" | "local_path">[];
}

function SyncStatusBadge({ status }: { status: string }) {
  switch (status) {
    case "synced":
      return (
        <Badge
          variant="outline"
          className="text-[10px] bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20"
        >
          Synced
        </Badge>
      );
    case "stale":
      return (
        <Badge
          variant="outline"
          className="text-[10px] bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20"
        >
          Update Available
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="text-[10px] text-muted-foreground">
          Not synced
        </Badge>
      );
  }
}

export function RepoIntegrationsContent({ repoId, concepts, linkedConcepts, repos }: RepoIntegrationsContentProps) {
  const router = useRouter();
  const [viewConcept, setViewConcept] = useState<Concept | null>(null);
  const [installConcept, setInstallConcept] = useState<Concept | null>(null);
  const [addFromLibraryOpen, setAddFromLibraryOpen] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);

  const grouped = concepts.reduce<Record<string, Concept[]>>((acc, c) => {
    if (!acc[c.concept_type]) acc[c.concept_type] = [];
    acc[c.concept_type].push(c);
    return acc;
  }, {});

  const linkedGrouped = linkedConcepts.reduce<Record<string, ConceptLinkWithConcept[]>>((acc, c) => {
    if (!acc[c.concept_type]) acc[c.concept_type] = [];
    acc[c.concept_type].push(c);
    return acc;
  }, {});

  const handleSync = async (conceptId: string) => {
    setSyncingId(conceptId);
    try {
      const result = await syncConceptToRepo(conceptId, repoId);
      if (result.success) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    } catch {
      toast.error("Sync failed");
    } finally {
      setSyncingId(null);
    }
  };

  const handleUnlink = async (conceptId: string) => {
    setUnlinkingId(conceptId);
    try {
      const result = await unlinkConcept(conceptId, repoId);
      if (result.success) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    } catch {
      toast.error("Unlink failed");
    } finally {
      setUnlinkingId(null);
    }
  };

  const handleSyncAll = async () => {
    setSyncingAll(true);
    try {
      const result = await syncAllConceptsToRepo(repoId);
      if (result.failed === 0) {
        toast.success(`Synced ${formatNumber(result.success)} integration(s)`);
      } else {
        toast.warning(`Synced ${formatNumber(result.success)}, failed ${formatNumber(result.failed)}`);
      }
      router.refresh();
    } catch {
      toast.error("Sync all failed");
    } finally {
      setSyncingAll(false);
    }
  };

  const totalCount = concepts.length + linkedConcepts.length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">AI Integrations</CardTitle>
      </CardHeader>
      <CardContent>
        {totalCount === 0 ? (
          <div className="py-12 text-center">
            <Puzzle className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <h3 className="font-medium mb-1">No Integrations Found</h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-3">
              Run a scan to discover Claude Code integrations like skills, hooks, commands, agents, and MCP servers.
            </p>
            <div className="flex items-center justify-center gap-3">
              <Button variant="outline" size="sm" onClick={() => setAddFromLibraryOpen(true)}>
                <Link2 className="w-4 h-4 mr-1.5" />
                Link from Library
              </Button>
              <Link
                href="/ai-integrations"
                className="text-sm text-primary hover:underline inline-flex items-center gap-1"
              >
                View all integrations <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {Object.entries(CONCEPT_TYPE_LABELS).map(([type, label]) => {
                const nativeCount = grouped[type]?.length || 0;
                const linkedCount = linkedGrouped[type]?.length || 0;
                const count = nativeCount + linkedCount;
                const Icon = CONCEPT_ICONS[type] || Puzzle;
                return (
                  <div
                    key={type}
                    className={`flex items-center gap-2 p-3 rounded-lg border ${count > 0 ? "" : "opacity-50"}`}
                  >
                    <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div>
                      <p className="text-lg font-bold leading-none">{count}</p>
                      <p className="text-[11px] text-muted-foreground">{label}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Native section (discovered in this repo) */}
            {concepts.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-3">Native (discovered in this repo)</h3>
                {Object.entries(grouped).map(([type, items]) => {
                  const Icon = CONCEPT_ICONS[type] || Puzzle;
                  return (
                    <div key={type} className="mb-4">
                      <h4 className="flex items-center gap-2 text-sm font-medium mb-2">
                        <Icon className="w-4 h-4" />
                        {CONCEPT_TYPE_LABELS[type] || type}
                      </h4>
                      <div className="space-y-2">
                        {items.map((concept) => (
                          <div
                            key={concept.id}
                            className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                          >
                            <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-sm">{concept.name}</span>
                                <Badge variant="outline" className="text-[10px]">
                                  {CONCEPT_TYPE_SINGULAR[type] || type}
                                </Badge>
                              </div>
                              {concept.description && (
                                <p className="text-xs text-muted-foreground mt-0.5 truncate">{concept.description}</p>
                              )}
                              <p className="text-[11px] font-mono text-muted-foreground/70 mt-0.5">
                                {concept.relative_path}
                              </p>
                            </div>
                            <TooltipProvider>
                              <div className="flex items-center gap-1 shrink-0">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button variant="ghost" size="sm" onClick={() => setInstallConcept(concept)}>
                                      <Share2 className="w-4 h-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Link to repo</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button variant="ghost" size="sm" onClick={() => setViewConcept(concept)}>
                                      <Eye className="w-4 h-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>View</TooltipContent>
                                </Tooltip>
                              </div>
                            </TooltipProvider>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Linked section (from other repos) */}
            {linkedConcepts.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-muted-foreground">Linked (from other repos)</h3>
                  <Button variant="outline" size="sm" onClick={handleSyncAll} disabled={syncingAll}>
                    <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${syncingAll ? "animate-spin" : ""}`} />
                    {syncingAll ? "Syncing..." : "Sync All"}
                  </Button>
                </div>
                {Object.entries(linkedGrouped).map(([type, items]) => {
                  const Icon = CONCEPT_ICONS[type] || Puzzle;
                  return (
                    <div key={type} className="mb-4">
                      <h4 className="flex items-center gap-2 text-sm font-medium mb-2">
                        <Icon className="w-4 h-4" />
                        {CONCEPT_TYPE_LABELS[type] || type}
                      </h4>
                      <div className="space-y-2">
                        {items.map((link) => {
                          const isSyncing = syncingId === link.concept_id;
                          const isUnlinking = unlinkingId === link.concept_id;
                          return (
                            <div
                              key={link.id}
                              className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                            >
                              <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-sm">{link.concept_name}</span>
                                  <Badge variant="outline" className="text-[10px]">
                                    {CONCEPT_TYPE_SINGULAR[type] || type}
                                  </Badge>
                                  <SyncStatusBadge status={link.sync_status} />
                                </div>
                                {link.concept_description && (
                                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                                    {link.concept_description}
                                  </p>
                                )}
                                <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                                  from{" "}
                                  <Link
                                    href={`/repositories/${link.origin_repo_id}`}
                                    className="text-primary hover:underline"
                                  >
                                    {link.origin_repo_name}
                                  </Link>
                                  <span className="font-mono ml-1.5">{link.concept_relative_path}</span>
                                </p>
                              </div>
                              <TooltipProvider>
                                <div className="flex items-center gap-1 shrink-0">
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleSync(link.concept_id)}
                                        disabled={isSyncing}
                                      >
                                        <RefreshCw className={`w-4 h-4 ${isSyncing ? "animate-spin" : ""}`} />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Sync to disk</TooltipContent>
                                  </Tooltip>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleUnlink(link.concept_id)}
                                        disabled={isUnlinking}
                                      >
                                        <Unlink className="w-4 h-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Unlink</TooltipContent>
                                  </Tooltip>
                                </div>
                              </TooltipProvider>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Actions */}
            <div className="pt-2 flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={() => setAddFromLibraryOpen(true)}>
                <Link2 className="w-4 h-4 mr-1.5" />
                Link from Library
              </Button>
              <Link
                href="/ai-integrations"
                className="text-sm text-primary hover:underline inline-flex items-center gap-1"
              >
                View all integrations <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        )}

        {/* View concept sheet */}
        <Sheet open={!!viewConcept} onOpenChange={(open) => !open && setViewConcept(null)}>
          <SheetContent className="sm:max-w-lg">
            <SheetHeader>
              <SheetTitle>{viewConcept?.name}</SheetTitle>
              <SheetDescription>
                {CONCEPT_TYPE_SINGULAR[viewConcept?.concept_type || ""] || viewConcept?.concept_type} —{" "}
                {viewConcept?.relative_path}
              </SheetDescription>
            </SheetHeader>
            <SheetBody>
              {viewConcept?.content && (
                <div className="mt-4">
                  <pre className="text-sm bg-muted p-4 rounded-lg font-mono overflow-auto max-h-[60vh] whitespace-pre-wrap">
                    {viewConcept.content}
                  </pre>
                </div>
              )}
            </SheetBody>
          </SheetContent>
        </Sheet>

        {/* Install concept dialog */}
        <InstallConceptDialog
          concept={installConcept}
          repos={repos}
          open={!!installConcept}
          onOpenChange={(open) => !open && setInstallConcept(null)}
          onInstalled={() => router.refresh()}
        />

        {/* Add from Library dialog */}
        <AddFromLibraryDialog
          repoId={repoId}
          existingConceptIds={[...concepts.map((c) => c.id), ...linkedConcepts.map((c) => c.concept_id)]}
          open={addFromLibraryOpen}
          onOpenChange={setAddFromLibraryOpen}
          onInstalled={() => router.refresh()}
        />
      </CardContent>
    </Card>
  );
}
