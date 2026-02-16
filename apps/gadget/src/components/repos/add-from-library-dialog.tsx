"use client";

import { Bot, Link2, Loader2, Puzzle, Search, Server, Sparkles, Star, Terminal, Zap } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@devkit/ui/components/badge";
import { Button } from "@devkit/ui/components/button";
import { Card, CardContent } from "@devkit/ui/components/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@devkit/ui/components/dialog";
import { Input } from "@devkit/ui/components/input";
import { Tabs, TabsList, TabsTrigger } from "@devkit/ui/components/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@devkit/ui/components/tooltip";
import { getAllConcepts, installConcept } from "@/lib/actions/concepts";
import { CONCEPT_TYPE_LABELS, CONCEPT_TYPE_SINGULAR, LIBRARY_REPO_ID } from "@/lib/constants";
import type { ConceptWithRepo } from "@/lib/types";
import { timeAgo } from "@/lib/utils";

const CONCEPT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  skill: Sparkles,
  hook: Zap,
  command: Terminal,
  agent: Bot,
  mcp_server: Server,
  plugin: Puzzle,
};

const UPPERCASE_WORDS = new Set([
  "mcp",
  "api",
  "aws",
  "cli",
  "ui",
  "ai",
  "db",
  "sql",
  "ssh",
  "url",
  "json",
  "xml",
  "html",
  "css",
  "js",
  "ts",
  "http",
  "jwt",
  "oauth",
  "sdk",
  "cdn",
  "ci",
  "cd",
  "pr",
  "llm",
]);

function formatConceptName(raw: string): string {
  const colonIdx = raw.indexOf(":");
  if (colonIdx === -1) return formatNamePart(raw);

  const prefix = formatNamePart(raw.slice(0, colonIdx));
  const base = formatNamePart(raw.slice(colonIdx + 1));

  if (prefix.toLowerCase() === base.toLowerCase()) return base;

  const prefixWords = prefix.toLowerCase().split(" ");
  const deduped = base
    .split(" ")
    .filter((w) => !prefixWords.includes(w.toLowerCase()))
    .join(" ");

  return `${prefix}: ${deduped || base}`;
}

function formatNamePart(part: string): string {
  const spaced = part.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
  const words = spaced.split(/(?<!\d)\.(?!\d)|[-_ {2}]+/).filter(Boolean);
  return words
    .map((w) => {
      const lower = w.toLowerCase();
      if (UPPERCASE_WORDS.has(lower)) return lower.toUpperCase();
      if (/^\d/.test(w)) return w;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

function getAuthorName(author: unknown): string | null {
  if (!author) return null;
  if (typeof author === "string") return author;
  if (typeof author === "object" && author !== null && "name" in author)
    return String((author as Record<string, unknown>).name);
  return null;
}

function formatStars(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(count >= 10000 ? 0 : 1)}k`;
  return String(count);
}

const TYPE_TABS = ["all", "skill", "hook", "command", "agent", "mcp_server", "plugin"] as const;

interface AddFromLibraryDialogProps {
  repoId: string;
  existingConceptIds: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInstalled?: () => void;
}

export function AddFromLibraryDialog({
  repoId,
  existingConceptIds,
  open,
  onOpenChange,
  onInstalled,
}: AddFromLibraryDialogProps) {
  const [concepts, setConcepts] = useState<ConceptWithRepo[]>([]);
  const [loading, setLoading] = useState(false);
  const [installing, setInstalling] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const loadConcepts = useCallback(async () => {
    setLoading(true);
    try {
      const all = await getAllConcepts();
      setConcepts(all.filter((c) => !existingConceptIds.includes(c.id) && c.repo_id !== repoId));
    } catch {
      toast.error("Failed to load concepts");
    } finally {
      setLoading(false);
    }
  }, [existingConceptIds, repoId]);

  useEffect(() => {
    if (open) {
      loadConcepts();
      setSearchQuery("");
      setTypeFilter("all");
    }
  }, [open, loadConcepts]);

  const handleInstall = async (conceptId: string) => {
    setInstalling(conceptId);
    try {
      const result = await installConcept(conceptId, repoId);
      if (result.success) {
        toast.success(result.message);
        setConcepts((prev) => prev.filter((c) => c.id !== conceptId));
        onInstalled?.();
      } else {
        toast.error(result.message);
      }
    } catch {
      toast.error("Install failed");
    } finally {
      setInstalling(null);
    }
  };

  const filtered = concepts.filter((c) => {
    if (typeFilter !== "all" && c.concept_type !== typeFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        c.name.toLowerCase().includes(q) ||
        formatConceptName(c.name).toLowerCase().includes(q) ||
        c.description?.toLowerCase().includes(q) ||
        c.repo_name.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Compute tab counts
  const typeCounts: Record<string, number> = {};
  for (const c of concepts) {
    typeCounts[c.concept_type] = (typeCounts[c.concept_type] || 0) + 1;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Link from Library</DialogTitle>
          <DialogDescription>Link integrations from other repos into this project.</DialogDescription>
        </DialogHeader>

        <Tabs value={typeFilter} onValueChange={setTypeFilter} className="flex-1 min-h-0 flex flex-col">
          <div className="flex flex-col sm:flex-row gap-3 shrink-0">
            <TabsList className="justify-start overflow-x-auto flex-nowrap">
              {TYPE_TABS.map((tab) => {
                const count = tab === "all" ? concepts.length : typeCounts[tab] || 0;
                return (
                  <TabsTrigger key={tab} value={tab} className="text-xs" disabled={count === 0 && tab !== "all"}>
                    {tab === "all" ? "All" : CONCEPT_TYPE_LABELS[tab] || tab}
                    {count > 0 && (
                      <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-[10px]">
                        {count}
                      </Badge>
                    )}
                  </TabsTrigger>
                );
              })}
            </TabsList>
            <div className="relative sm:ml-auto">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search integrations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 w-full sm:w-56"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto mt-4">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No available integrations found.</p>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-3">
                {filtered.map((concept) => {
                  const Icon = CONCEPT_ICONS[concept.concept_type] || Puzzle;
                  const isLibrary = concept.repo_id === LIBRARY_REPO_ID;
                  return (
                    <Card key={concept.id} className="hover:border-primary/30 transition-colors">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <TooltipProvider delayDuration={300}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                                  <Icon className="w-4 h-4 text-muted-foreground" />
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="left">
                                {CONCEPT_TYPE_SINGULAR[concept.concept_type] || concept.concept_type}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <div className="flex-1 min-w-0">
                            <span className="font-semibold text-sm truncate block mb-0.5">
                              {formatConceptName(concept.name)}
                            </span>
                            <div className="flex items-center gap-1 mb-1 flex-wrap">
                              {(() => {
                                const repoNames = concept.all_repo_names?.split(", ").filter(Boolean) || [];
                                const repoIds = concept.all_repo_ids?.split(",").filter(Boolean) || [];
                                if (repoNames.length > 0) {
                                  return repoNames.map((name, i) => {
                                    const rid = repoIds[i];
                                    const isLib = rid === LIBRARY_REPO_ID || name === "Library";
                                    return (
                                      <Badge key={rid || name} variant="secondary" className="text-[10px] h-4 px-1.5">
                                        {isLib ? concept.source_name || "Library" : name}
                                      </Badge>
                                    );
                                  });
                                }
                                return (
                                  <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                                    {isLibrary ? concept.source_name || "Library" : concept.repo_name}
                                  </Badge>
                                );
                              })()}
                            </div>
                            {concept.description && (
                              <p className="text-xs text-muted-foreground line-clamp-2">{concept.description}</p>
                            )}
                            {Boolean(concept.metadata?.last_modified || concept.metadata?.repo_stars) && (
                              <div className="flex items-center gap-1.5 mt-1 text-[11px] text-muted-foreground">
                                {Boolean(concept.metadata.last_modified) && (
                                  <span>Updated {timeAgo(concept.metadata.last_modified as string)}</span>
                                )}
                                {Boolean(concept.metadata.last_modified && getAuthorName(concept.metadata.author)) && (
                                  <span>·</span>
                                )}
                                {getAuthorName(concept.metadata.author) && (
                                  <span>by {getAuthorName(concept.metadata.author)}</span>
                                )}
                                {typeof concept.metadata.repo_stars === "number" && concept.metadata.repo_stars > 0 && (
                                  <>
                                    {Boolean(
                                      concept.metadata.last_modified || getAuthorName(concept.metadata.author),
                                    ) && <span>·</span>}
                                    <span className="inline-flex items-center gap-0.5">
                                      <Star className="w-3 h-3" />
                                      {formatStars(concept.metadata.repo_stars)}
                                    </span>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2 mt-3 justify-end">
                          <Button
                            variant="outline"
                            size="sm"
                            className="shrink-0"
                            disabled={installing === concept.id}
                            onClick={() => handleInstall(concept.id)}
                          >
                            {installing === concept.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <>
                                <Link2 className="w-3.5 h-3.5 mr-1" />
                                Link
                              </>
                            )}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
