"use client";

import { Badge } from "@devkit/ui/components/badge";
import { Button } from "@devkit/ui/components/button";
import { Card, CardContent } from "@devkit/ui/components/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@devkit/ui/components/collapsible";
import { Input } from "@devkit/ui/components/input";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@devkit/ui/components/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@devkit/ui/components/tooltip";
import {
  Bot,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Code2,
  Info,
  Link2,
  Loader2,
  Plus,
  Puzzle,
  RefreshCw,
  Search,
  Server,
  Sparkles,
  Star,
  Terminal,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { AddSourceDialog } from "@/components/concepts/add-source-dialog";
import { ConceptSourcesPanel } from "@/components/concepts/concept-sources-panel";
import { InstallConceptDialog } from "@/components/concepts/install-concept-dialog";
import { PageBanner } from "@/components/layout/page-banner";
import { PageTabs, type Tab } from "@/components/layout/page-tabs";
import { refreshAllSources } from "@/lib/actions/concept-sources";
import { CONCEPT_TYPE_LABELS, CONCEPT_TYPE_SINGULAR, LIBRARY_REPO_ID } from "@/lib/constants";
import type { ConceptSourceWithStats, ConceptWithRepo, Repo } from "@/lib/types";
import { formatNumber, timeAgo } from "@/lib/utils";

function getAuthorName(author: unknown): string | null {
  if (!author) return null;
  if (typeof author === "string") return author;
  if (typeof author === "object" && author !== null && "name" in author)
    return String((author as Record<string, unknown>).name);
  return null;
}

/** Build a GitHub file URL from concept metadata, or null if not a GitHub concept */
function getGitHubFileUrl(metadata: Record<string, unknown>, relativePath: string): string | null {
  const owner = metadata.github_owner as string | undefined;
  const repo = metadata.github_repo as string | undefined;
  const ref = metadata.github_ref as string | undefined;
  if (!owner || !repo) return null;
  const filePath = relativePath.split("#")[0];
  return `https://github.com/${owner}/${repo}/blob/${ref || "main"}/${filePath}`;
}

/** Build a GitHub repo URL from concept metadata, or null */
function getGitHubRepoUrl(metadata: Record<string, unknown>): string | null {
  const owner = metadata.github_owner as string | undefined;
  const repo = metadata.github_repo as string | undefined;
  if (!owner || !repo) return null;
  return `https://github.com/${owner}/${repo}`;
}

function formatStars(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(count >= 10000 ? 0 : 1)}k`;
  return String(count);
}

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

/** Format a raw concept name into a readable display name */
function formatConceptName(raw: string): string {
  const colonIdx = raw.indexOf(":");
  if (colonIdx === -1) return formatNamePart(raw);

  const prefix = formatNamePart(raw.slice(0, colonIdx));
  const base = formatNamePart(raw.slice(colonIdx + 1));

  // Full duplicate: "foo:foo" → just "Foo"
  if (prefix.toLowerCase() === base.toLowerCase()) return base;

  // Partial dedup: "hookify:Writing Hookify Rules" → "Hookify: Writing Rules"
  const prefixWords = prefix.toLowerCase().split(" ");
  const deduped = base
    .split(" ")
    .filter((w) => !prefixWords.includes(w.toLowerCase()))
    .join(" ");

  return `${prefix}: ${deduped || base}`;
}

function formatNamePart(part: string): string {
  // Insert spaces before uppercase runs in camelCase/PascalCase: "PreToolUse" → "Pre Tool Use"
  const spaced = part.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
  // Preserve dots in version numbers (e.g. "4.5"), split on other separators
  const words = spaced.split(/(?<!\d)\.(?!\d)|[-_ {2}]+/).filter(Boolean);
  return words
    .map((w) => {
      const lower = w.toLowerCase();
      if (UPPERCASE_WORDS.has(lower)) return lower.toUpperCase();
      // Don't title-case pure version numbers like "4.5"
      if (/^\d/.test(w)) return w;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

const CONCEPT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  skill: Sparkles,
  hook: Zap,
  command: Terminal,
  agent: Bot,
  mcp_server: Server,
  plugin: Puzzle,
};

const CONCEPT_TYPES = ["all", "skill", "hook", "command", "agent", "mcp_server", "plugin"];

interface PatternsLibraryClientProps {
  concepts: ConceptWithRepo[];
  stats: Record<string, number>;
  repos: Pick<Repo, "id" | "name" | "local_path">[];
  sources: ConceptSourceWithStats[];
  initialType?: string;
  configuredKeys?: string[];
  hasGitPat?: boolean;
}

export function PatternsLibraryClient({
  concepts,
  stats,
  repos,
  sources,
  initialType,
  configuredKeys = [],
  hasGitPat,
}: PatternsLibraryClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeType = searchParams?.get("type") || initialType || "all";

  const setActiveType = useCallback(
    (type: string) => {
      const params = new URLSearchParams(searchParams?.toString() || "");
      if (type === "all") {
        params.delete("type");
      } else {
        params.set("type", type);
      }
      const qs = params.toString();
      router.push(`/ai-integrations${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [router, searchParams],
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [viewConcept, setViewConcept] = useState<ConceptWithRepo | null>(null);
  const [installConcept, setInstallConcept] = useState<ConceptWithRepo | null>(null);
  const [showAddSource, setShowAddSource] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const [isRescanningAll, setIsRescanningAll] = useState(false);

  const handleRescanAll = useCallback(async () => {
    setIsRescanningAll(true);
    try {
      const result = await refreshAllSources();
      if (result.success) {
        toast.success(result.message);
      } else {
        toast.warning(result.message);
      }
      router.refresh();
    } catch {
      toast.error("Failed to rescan sources");
    } finally {
      setIsRescanningAll(false);
    }
  }, [router]);

  const totalCount = Object.values(stats).reduce((a, b) => a + b, 0);

  // Check if an MCP server concept has all required env keys configured
  const isMcpConfigured = (c: ConceptWithRepo) => {
    if (c.concept_type !== "mcp_server") return true;
    const config = (c.metadata?.config as Record<string, unknown>) || {};
    const envKeys = config.env as Record<string, string> | undefined;
    if (!envKeys || Object.keys(envKeys).length === 0) return true;
    return Object.keys(envKeys).every((k) => configuredKeys.includes(k));
  };

  const hiddenMcpCount = concepts.filter((c) => c.concept_type === "mcp_server" && !isMcpConfigured(c)).length;
  const visibleMcpCount = (stats.mcp_server || 0) - hiddenMcpCount;

  // Filter sources: hide builtin GitHub sources when no PAT configured
  const visibleSources = sources.filter((s) => {
    if (s.source_type === "github_repo" && s.is_builtin && !hasGitPat) return false;
    return true;
  });
  const hiddenSourceCount = sources.length - visibleSources.length;

  const filtered = concepts.filter((c) => {
    if (!isMcpConfigured(c)) return false;
    if (activeType !== "all" && c.concept_type !== activeType) return false;
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

  if (totalCount === 0 && sources.length === 0) {
    return (
      <div className="flex flex-col">
        <PageBanner title="AI Integrations" />
        <div className="flex-1">
          <div className="p-4 sm:p-6 max-w-7xl mx-auto">
            <Card>
              <CardContent className="py-16 text-center">
                <Puzzle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">No AI Integrations Yet</h3>
                <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
                  Add sources to discover concepts — scan GitHub repos, browse curated MCP servers, or import an MCP
                  server list.
                </p>
                <div className="flex gap-2 justify-center">
                  <Button variant="outline" onClick={() => setShowAddSource(true)}>
                    <Plus className="w-4 h-4 mr-1.5" />
                    Add Source
                  </Button>
                  <Button asChild variant="outline">
                    <Link href="/scans">Scan Local Repos</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
            <AddSourceDialog open={showAddSource} onOpenChange={setShowAddSource} />
          </div>
        </div>
      </div>
    );
  }

  const conceptTabs: Tab[] = CONCEPT_TYPES.map((type) => {
    const rawCount = type === "all" ? totalCount : stats[type] || 0;
    const count = type === "mcp_server" ? visibleMcpCount : type === "all" ? totalCount - hiddenMcpCount : rawCount;
    const label = type === "all" ? "All" : CONCEPT_TYPE_LABELS[type] || type;
    return { id: type, label, count: count > 0 ? count : undefined };
  });

  return (
    <div className="flex flex-col">
      <PageTabs
        tabs={conceptTabs}
        value={activeType}
        onValueChange={setActiveType}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={handleRescanAll} disabled={isRescanningAll}>
              {isRescanningAll ? (
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-1.5" />
              )}
              {isRescanningAll ? "Scanning..." : "Rescan All"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowSources(!showSources)}>
              {showSources ? <ChevronUp className="w-4 h-4 mr-1.5" /> : <ChevronDown className="w-4 h-4 mr-1.5" />}
              Sources ({formatNumber(visibleSources.length)})
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowAddSource(true)}>
              <Plus className="w-4 h-4 mr-1.5" />
              Add Source
            </Button>
          </>
        }
      />
      <div className="flex-1">
        <div className="p-4 sm:p-6 max-w-7xl mx-auto">
          {/* Sources panel (collapsible) */}
          {showSources && (
            <div className="mb-6">
              <ConceptSourcesPanel sources={visibleSources} hiddenGitHubCount={hiddenSourceCount} />
            </div>
          )}

          <div className="space-y-4">
            <div className="relative sm:ml-auto">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search integrations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 w-full sm:w-64"
              />
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filtered.map((concept) => {
                const Icon = CONCEPT_ICONS[concept.concept_type] || Puzzle;
                const isLibrary = concept.repo_id === LIBRARY_REPO_ID;
                return (
                  <Card
                    key={concept.id}
                    className="hover:border-primary/30 transition-colors cursor-pointer"
                    onClick={() => setViewConcept(concept)}
                  >
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
                                  return isLib ? (
                                    <Badge key={rid || name} variant="secondary" className="text-[10px] h-4 px-1.5">
                                      {concept.source_name || "Library"}
                                    </Badge>
                                  ) : (
                                    <Link
                                      key={rid || name}
                                      href={`/repositories/${rid}`}
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <Badge
                                        variant="secondary"
                                        className="text-[10px] h-4 px-1.5 hover:bg-muted cursor-pointer"
                                      >
                                        {name}
                                      </Badge>
                                    </Link>
                                  );
                                });
                              }
                              return isLibrary ? (
                                <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                                  {concept.source_name || "Library"}
                                </Badge>
                              ) : (
                                <Link href={`/repositories/${concept.repo_id}`} onClick={(e) => e.stopPropagation()}>
                                  <Badge
                                    variant="secondary"
                                    className="text-[10px] h-4 px-1.5 hover:bg-muted cursor-pointer"
                                  >
                                    {concept.repo_name}
                                  </Badge>
                                </Link>
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
                          onClick={(e) => {
                            e.stopPropagation();
                            setInstallConcept(concept);
                          }}
                        >
                          <Link2 className="w-3.5 h-3.5 mr-1" />
                          Link
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
            {filtered.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No integrations match your search</p>
              </div>
            )}
            {(activeType === "mcp_server" || activeType === "all") && hiddenMcpCount > 0 && (
              <div className="flex items-center gap-2 p-3 rounded-lg border bg-muted/50 text-sm text-muted-foreground mt-4">
                <Info className="w-4 h-4 shrink-0" />
                <span>
                  {formatNumber(hiddenMcpCount)} MCP server{hiddenMcpCount !== 1 ? "s" : ""} hidden due to missing API
                  keys.{" "}
                  <Link href="/settings?tab=api-keys" className="text-primary hover:underline">
                    Configure API Keys
                  </Link>
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* View integration sheet */}
      <Sheet open={!!viewConcept} onOpenChange={(open) => !open && setViewConcept(null)}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{viewConcept ? formatConceptName(viewConcept.name) : ""}</SheetTitle>
            <SheetDescription>
              {viewConcept?.description
                ? viewConcept.description
                : CONCEPT_TYPE_SINGULAR[viewConcept?.concept_type || ""] || viewConcept?.concept_type}
              {viewConcept && viewConcept.repo_id !== LIBRARY_REPO_ID && (
                <>
                  {" "}
                  — from{" "}
                  <Link href={`/repositories/${viewConcept.repo_id}`} className="text-primary hover:underline">
                    {viewConcept.repo_name}
                  </Link>
                </>
              )}
              {viewConcept && viewConcept.repo_id === LIBRARY_REPO_ID && viewConcept.source_name && (
                <> — from {viewConcept.source_name}</>
              )}
            </SheetDescription>
          </SheetHeader>
          <SheetBody>
            {viewConcept &&
              (() => {
                const repoNames = viewConcept.all_repo_names?.split(", ").filter(Boolean) || [];
                const repoIds = viewConcept.all_repo_ids?.split(",").filter(Boolean) || [];
                return repoNames.length > 0 ? (
                  <div className="mt-4">
                    <h4 className="text-sm font-medium mb-2">Found in</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {repoNames.map((name, i) => {
                        const rid = repoIds[i];
                        const isLib = rid === LIBRARY_REPO_ID || name === "Library";
                        return isLib ? (
                          <Badge key={rid || name} variant="secondary" className="text-xs">
                            {viewConcept.source_name || "Library"}
                          </Badge>
                        ) : (
                          <Link key={rid || name} href={`/repositories/${rid}`}>
                            <Badge variant="outline" className="text-xs hover:bg-muted cursor-pointer">
                              {name}
                            </Badge>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                ) : null;
              })()}
            {viewConcept && (
              <div className="mt-4 space-y-1.5">
                <h4 className="text-sm font-medium mb-2">Details</h4>
                <p className="text-xs text-muted-foreground">
                  Type: {CONCEPT_TYPE_SINGULAR[viewConcept.concept_type] || viewConcept.concept_type}
                </p>
                <p className="text-xs text-muted-foreground font-mono break-all">
                  Path: {(() => {
                    const ghUrl = getGitHubFileUrl(viewConcept.metadata, viewConcept.relative_path);
                    return ghUrl ? (
                      <a
                        href={ghUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        {viewConcept.relative_path}
                      </a>
                    ) : (
                      viewConcept.relative_path
                    );
                  })()}
                </p>
                {Boolean(viewConcept.metadata.last_modified) && (
                  <p className="text-xs text-muted-foreground">
                    Last modified:{" "}
                    {new Date(viewConcept.metadata.last_modified as string).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}{" "}
                    ({timeAgo(viewConcept.metadata.last_modified as string)})
                  </p>
                )}
                {getAuthorName(viewConcept.metadata.author) && (
                  <p className="text-xs text-muted-foreground">Author: {getAuthorName(viewConcept.metadata.author)}</p>
                )}
                {Boolean(viewConcept.metadata.plugin) && (
                  <p className="text-xs text-muted-foreground">
                    Plugin: {formatNamePart(viewConcept.metadata.plugin as string)}
                  </p>
                )}
                {typeof viewConcept.metadata.repo_stars === "number" && (
                  <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
                    <Star className="w-3 h-3" /> {(() => {
                      const repoUrl = getGitHubRepoUrl(viewConcept.metadata);
                      return repoUrl ? (
                        <a
                          href={repoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          {viewConcept.metadata.repo_stars.toLocaleString()} stars
                        </a>
                      ) : (
                        <>{viewConcept.metadata.repo_stars.toLocaleString()} stars</>
                      );
                    })()}
                  </p>
                )}
                {Array.isArray(viewConcept.metadata.repo_topics) &&
                  (viewConcept.metadata.repo_topics as string[]).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {(viewConcept.metadata.repo_topics as string[]).map((topic) => (
                        <Badge key={topic} variant="secondary" className="text-[10px] h-4 px-1.5">
                          {topic}
                        </Badge>
                      ))}
                    </div>
                  )}
              </div>
            )}
            {viewConcept?.content && (
              <Collapsible className="mt-4">
                <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium hover:text-primary transition-colors group w-full">
                  <ChevronRight className="w-4 h-4 transition-transform group-data-[open]:rotate-90" />
                  <Code2 className="w-4 h-4 text-muted-foreground" />
                  File Contents
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <pre className="text-sm bg-muted p-4 rounded-lg font-mono overflow-auto max-h-[60vh] whitespace-pre-wrap mt-2">
                    {viewConcept.content}
                  </pre>
                </CollapsibleContent>
              </Collapsible>
            )}
          </SheetBody>
        </SheetContent>
      </Sheet>

      {/* Install dialog */}
      <InstallConceptDialog
        concept={installConcept}
        repos={repos}
        open={!!installConcept}
        onOpenChange={(open) => !open && setInstallConcept(null)}
      />

      {/* Add source dialog */}
      <AddSourceDialog open={showAddSource} onOpenChange={setShowAddSource} />
    </div>
  );
}
