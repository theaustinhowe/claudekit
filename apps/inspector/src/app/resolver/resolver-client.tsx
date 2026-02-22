"use client";

import { useSessionStream } from "@devkit/hooks";
import { cn } from "@devkit/ui";
import { Badge } from "@devkit/ui/components/badge";
import { Button } from "@devkit/ui/components/button";
import { Card, CardContent } from "@devkit/ui/components/card";
import { Checkbox } from "@devkit/ui/components/checkbox";
import { Skeleton } from "@devkit/ui/components/skeleton";
import { Check, CheckCircle2, ChevronDown, ChevronRight, ClipboardCopy, MessageSquare, Zap } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useState, useTransition } from "react";
import { toast } from "sonner";
import { SessionProgress } from "@/components/session-progress";
import { getPRComments } from "@/lib/actions/prs";
import { getCommentFixes, resolveAllFixes, resolveCommentFix, startCommentFixes } from "@/lib/actions/resolver";
import { SEVERITY_COLORS, SEVERITY_LABELS } from "@/lib/constants";
import { exportFixesToMarkdown } from "@/lib/export";
import type { CommentStatus, PRWithComments } from "@/lib/types";

type Phase = "select-pr" | "select-comments" | "fixing" | "results";

const statusConfig: Record<CommentStatus, { label: string; color: string; icon: typeof Check }> = {
  open: { label: "Open", color: "text-muted-foreground", icon: MessageSquare },
  fixing: { label: "Fixing\u2026", color: "text-status-info", icon: Zap },
  fixed: { label: "Fixed", color: "text-status-success", icon: Check },
  resolved: { label: "Resolved", color: "text-status-success", icon: CheckCircle2 },
};

interface Comment {
  id: string;
  reviewer: string;
  reviewer_avatar: string | null;
  body: string;
  file_path: string | null;
  line_number: number | null;
  severity: string | null;
  category: string | null;
}

interface FixResult {
  commentId: string;
  suggestedFix: string | null;
  fixDiff: string | null;
  status: string;
}

interface ResolverClientProps {
  repoId: string;
  prsWithComments: PRWithComments[];
}

export function ResolverClient({ repoId: _repoId, prsWithComments }: ResolverClientProps) {
  const [selectedPR, setSelectedPR] = useState<PRWithComments | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [selectedComments, setSelectedComments] = useState<Set<string>>(new Set());
  const [phase, setPhase] = useState<Phase>("select-pr");
  const [commentStatuses, setCommentStatuses] = useState<Record<string, CommentStatus>>({});
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());
  const [fixes, setFixes] = useState<FixResult[]>([]);
  const [isPending, startTransition] = useTransition();
  const [sessionId, setSessionId] = useState<string | null>(null);

  const handleSelectPR = (pr: PRWithComments) => {
    setSelectedPR(pr);
    startTransition(async () => {
      const result = await getPRComments(pr.id);
      setComments(result);
      setPhase("select-comments");
    });
  };

  const toggleComment = (id: string) => {
    setSelectedComments((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAllComments = () => {
    if (selectedComments.size === comments.length) setSelectedComments(new Set());
    else setSelectedComments(new Set(comments.map((c) => c.id)));
  };

  const toggleExpanded = (id: string) => {
    setExpandedComments((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleSessionComplete = useCallback(
    (event: { type: string; data?: Record<string, unknown> }) => {
      if (event.type === "done") {
        startTransition(async () => {
          const fixResults = await getCommentFixes([...selectedComments]);
          setFixes(
            fixResults.map((f) => ({
              commentId: f.comment_id,
              suggestedFix: f.suggested_fix,
              fixDiff: f.fix_diff,
              status: f.status,
            })),
          );
          setCommentStatuses((prev) => {
            const next = { ...prev };
            for (const k of Object.keys(next)) next[k] = "fixed";
            return next;
          });
          setPhase("results");
          toast.success("Fixes generated", {
            description: `${fixResults.length} fix${fixResults.length !== 1 ? "es" : ""} ready for review`,
          });
        });
      } else if (event.type === "error") {
        toast.error("Fix generation failed", { description: event.data?.message as string });
        setPhase("select-comments");
      } else if (event.type === "cancelled") {
        toast.info("Fix generation cancelled");
        setPhase("select-comments");
      }
      setSessionId(null);
    },
    [selectedComments],
  );

  const stream = useSessionStream({
    sessionId,
    onComplete: handleSessionComplete,
  });

  const handleStartFixing = () => {
    setPhase("fixing");

    const statuses: Record<string, CommentStatus> = {};
    selectedComments.forEach((id) => {
      statuses[id] = "fixing";
    });
    setCommentStatuses(statuses);

    startTransition(async () => {
      try {
        const id = await startCommentFixes([...selectedComments]);
        setSessionId(id);
      } catch (err) {
        toast.error("Failed to start fix generation", {
          description: err instanceof Error ? err.message : "Unknown error",
        });
        setPhase("select-comments");
      }
    });
  };

  const handleResolve = (commentId: string) => {
    setCommentStatuses((prev) => ({ ...prev, [commentId]: "resolved" }));
    startTransition(async () => {
      await resolveCommentFix(commentId);
    });
  };

  const handleResolveAll = () => {
    setCommentStatuses((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(next)) next[k] = "resolved";
      return next;
    });
    startTransition(async () => {
      await resolveAllFixes([...selectedComments]);
    });
  };

  // Phase: Fixing
  if (phase === "fixing") {
    return (
      <SessionProgress
        stream={stream}
        icon={<Zap className="h-12 w-12 text-primary mb-6 animate-pulse" />}
        title="Generating Fixes"
        subtitle={`Fixing ${selectedComments.size} comment${selectedComments.size !== 1 ? "s" : ""} on PR #${selectedPR?.number}`}
      />
    );
  }

  // Phase: Results
  if (phase === "results") {
    const fixedComments = comments.filter((c) => selectedComments.has(c.id));
    const allResolved = fixedComments.every((c) => commentStatuses[c.id] === "resolved");
    const resolvedCount = fixedComments.filter((c) => commentStatuses[c.id] === "resolved").length;

    return (
      <div className="p-4 sm:p-6 max-w-[900px] mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold mb-1">Fix Results</h1>
            <p className="text-sm text-muted-foreground">
              {resolvedCount}/{fixedComments.length} comments resolved on PR #{selectedPR?.number}
            </p>
          </div>
          <div className="flex gap-2">
            {!allResolved && (
              <Button variant="outline" size="sm" onClick={handleResolveAll}>
                <CheckCircle2 className="h-4 w-4 mr-1" /> Resolve All
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const md = exportFixesToMarkdown(fixes, fixedComments);
                navigator.clipboard.writeText(md);
                toast.success("Copied to clipboard");
              }}
            >
              <ClipboardCopy className="h-4 w-4 mr-1" /> Copy as Markdown
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setPhase("select-pr");
                setSelectedPR(null);
                setSelectedComments(new Set());
                setCommentStatuses({});
                setFixes([]);
              }}
            >
              New Fix
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          {fixedComments.map((comment) => {
            const status = commentStatuses[comment.id] || "fixed";
            const config = statusConfig[status];
            const isExpanded = expandedComments.has(comment.id);
            const fix = fixes.find((f) => f.commentId === comment.id);

            return (
              <motion.div key={comment.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <Card>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          "h-2.5 w-2.5 rounded-full mt-1.5 shrink-0",
                          SEVERITY_COLORS[comment.severity ?? "nit"],
                        )}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-xs font-medium">{comment.reviewer}</span>
                          {comment.severity && (
                            <Badge variant="secondary" className="text-[10px]">
                              {SEVERITY_LABELS[comment.severity]}
                            </Badge>
                          )}
                          <span className={cn("text-xs ml-auto flex items-center gap-1", config.color)}>
                            <config.icon className="h-3 w-3" /> {config.label}
                          </span>
                        </div>
                        <p className="text-sm text-foreground mb-1">{comment.body}</p>
                        {comment.file_path && (
                          <code className="text-[11px] font-mono text-muted-foreground">
                            {comment.file_path}:{comment.line_number}
                          </code>
                        )}
                      </div>
                    </div>

                    {fix?.fixDiff && (
                      <button
                        type="button"
                        onClick={() => toggleExpanded(comment.id)}
                        className="flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                        {isExpanded ? "Hide fix" : "View fix"}
                      </button>
                    )}

                    <AnimatePresence>
                      {isExpanded && fix?.fixDiff && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <pre className="text-[11px] font-mono bg-muted/50 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">
                            {fix.fixDiff.split("\n").map((line, i) => (
                              <div
                                key={`${i}-${line}`}
                                className={cn(
                                  line.startsWith("+") && !line.startsWith("@@")
                                    ? "text-status-success bg-status-success/10"
                                    : line.startsWith("-") && !line.startsWith("@@")
                                      ? "text-status-error bg-status-error/10"
                                      : line.startsWith("@@")
                                        ? "text-status-info"
                                        : "",
                                )}
                              >
                                {line}
                              </div>
                            ))}
                          </pre>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {status === "fixed" && (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs h-7"
                          onClick={() => handleResolve(comment.id)}
                        >
                          <CheckCircle2 className="h-3 w-3 mr-1" /> Resolve
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </div>
    );
  }

  // Phase: Select Comments
  if (phase === "select-comments" && selectedPR) {
    return (
      <div className="p-4 sm:p-6 max-w-[900px] mx-auto space-y-6">
        <div>
          <button
            type="button"
            className="text-xs text-primary hover:underline mb-2"
            onClick={() => {
              setPhase("select-pr");
              setSelectedPR(null);
              setSelectedComments(new Set());
            }}
          >
            &larr; Back to PR selection
          </button>
          <h1 className="text-2xl font-bold mb-1">Select Comments to Fix</h1>
          <p className="text-sm text-muted-foreground">
            PR #{selectedPR.number} &mdash; {selectedPR.title}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={selectAllComments}>
            {selectedComments.size === comments.length ? "Deselect All" : "Select All"}
          </Button>
          <span className="text-xs text-muted-foreground">
            {comments.length} comment{comments.length !== 1 ? "s" : ""} available
          </span>
        </div>

        <Card>
          <CardContent className="p-2 space-y-1">
            {isPending && comments.length === 0 ? (
              <div className="p-3 space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders
                  <div key={i} className="flex items-start gap-3 px-3 py-3">
                    <Skeleton className="h-4 w-4 mt-0.5 rounded" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-3 w-24" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-3 w-48" />
                    </div>
                  </div>
                ))}
              </div>
            ) : comments.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">No review comments found for this PR.</div>
            ) : (
              comments.map((comment) => (
                // biome-ignore lint/a11y/noLabelWithoutControl: label wraps input component
                <label
                  key={comment.id}
                  className="flex items-start gap-3 px-3 py-3 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                >
                  <Checkbox
                    checked={selectedComments.has(comment.id)}
                    onCheckedChange={() => toggleComment(comment.id)}
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div
                        className={cn("h-2 w-2 rounded-full shrink-0", SEVERITY_COLORS[comment.severity ?? "nit"])}
                      />
                      <span className="text-xs font-medium">{comment.reviewer}</span>
                      {comment.category && (
                        <Badge variant="secondary" className="text-[10px] py-0">
                          {comment.category}
                        </Badge>
                      )}
                      {comment.severity && (
                        <Badge variant="outline" className="text-[10px] py-0">
                          {SEVERITY_LABELS[comment.severity]}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-foreground leading-relaxed">{comment.body}</p>
                    {comment.file_path && (
                      <code className="text-[11px] font-mono text-muted-foreground">
                        {comment.file_path}:{comment.line_number}
                      </code>
                    )}
                  </div>
                </label>
              ))
            )}
          </CardContent>
        </Card>

        <Button
          className="gradient-primary text-primary-foreground w-full"
          disabled={selectedComments.size === 0}
          onClick={handleStartFixing}
        >
          <Zap className="h-4 w-4 mr-2" />
          Fix {selectedComments.size} Comment{selectedComments.size !== 1 ? "s" : ""}
        </Button>
      </div>
    );
  }

  // Phase: Select PR
  return (
    <div className="p-4 sm:p-6 max-w-[900px] mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-1">Comment Resolver</h1>
        <p className="text-sm text-muted-foreground">Select a PR to auto-fix review comments with AI</p>
      </div>

      <Card>
        <CardContent className="p-2 space-y-1">
          {prsWithComments.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              No PRs with review comments found. Sync your repository first.
            </div>
          ) : (
            prsWithComments.map((pr) => (
              <button
                type="button"
                key={pr.id}
                className="flex items-center gap-3 w-full px-3 py-3 rounded-lg hover:bg-muted/50 transition-colors text-left"
                onClick={() => handleSelectPR(pr)}
              >
                {pr.authorAvatar ? (
                  // biome-ignore lint/performance/noImgElement: external avatar URL
                  <img src={pr.authorAvatar} alt={pr.author} className="h-8 w-8 rounded-full shrink-0" />
                ) : (
                  <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center text-[10px] font-bold text-secondary-foreground shrink-0">
                    {pr.author.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-medium text-sm truncate">{pr.title}</span>
                    <span className="text-xs text-muted-foreground shrink-0">#{pr.number}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{pr.author}</span>
                    <span>&middot;</span>
                    <span>
                      {pr.commentCount} comment{pr.commentCount !== 1 ? "s" : ""}
                    </span>
                  </div>
                </div>
                <Badge variant="secondary" className="text-xs shrink-0">
                  <MessageSquare className="h-3 w-3 mr-1" />
                  {pr.commentCount}
                </Badge>
              </button>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
