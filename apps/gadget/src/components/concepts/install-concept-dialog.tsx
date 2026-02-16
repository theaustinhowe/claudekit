"use client";

import { Badge } from "@devkit/ui/components/badge";
import { Button } from "@devkit/ui/components/button";
import { Checkbox } from "@devkit/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@devkit/ui/components/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@devkit/ui/components/select";
import { Bot, Link2, Puzzle, Server, Sparkles, Terminal, Zap } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { installConcept, linkConcept } from "@/lib/actions/concepts";
import { CONCEPT_TYPE_SINGULAR, LIBRARY_REPO_ID } from "@/lib/constants";
import type { Concept, ConceptWithRepo, Repo } from "@/lib/types";

const CONCEPT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  skill: Sparkles,
  hook: Zap,
  command: Terminal,
  agent: Bot,
  mcp_server: Server,
  plugin: Puzzle,
};

interface InstallConceptDialogProps {
  concept: Concept | ConceptWithRepo | null;
  repos: Pick<Repo, "id" | "name" | "local_path">[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInstalled?: () => void;
}

function getTargetPath(concept: Concept | ConceptWithRepo): string {
  switch (concept.concept_type) {
    case "hook":
      return ".claude/settings.json (merged)";
    case "mcp_server":
      return ".mcp.json (merged)";
    default:
      return concept.relative_path;
  }
}

export function InstallConceptDialog({ concept, repos, open, onOpenChange, onInstalled }: InstallConceptDialogProps) {
  const [targetRepoId, setTargetRepoId] = useState<string>("");
  const [installing, setInstalling] = useState(false);
  const [syncToDisk, setSyncToDisk] = useState(true);

  if (!concept) return null;

  const Icon = CONCEPT_ICONS[concept.concept_type] || Puzzle;
  const availableRepos = repos.filter((r) => r.id !== concept.repo_id && r.id !== LIBRARY_REPO_ID);
  const isMerge = concept.concept_type === "hook" || concept.concept_type === "mcp_server";

  const handleLink = async () => {
    if (!targetRepoId) return;
    setInstalling(true);
    try {
      const result = syncToDisk
        ? await installConcept(concept.id, targetRepoId)
        : await linkConcept(concept.id, targetRepoId);
      if (result.success) {
        toast.success(result.message);
        onOpenChange(false);
        setTargetRepoId("");
        onInstalled?.();
      } else {
        toast.error(result.message);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Link failed");
    } finally {
      setInstalling(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="w-5 h-5" />
            Link {CONCEPT_TYPE_SINGULAR[concept.concept_type] || concept.concept_type}
          </DialogTitle>
          <DialogDescription>Link &quot;{concept.name}&quot; to another repository</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Concept preview */}
          <div className="p-3 rounded-lg border bg-muted/30">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium text-sm">{concept.name}</span>
              <Badge variant="outline" className="text-[10px]">
                {CONCEPT_TYPE_SINGULAR[concept.concept_type] || concept.concept_type}
              </Badge>
            </div>
            {concept.description && <p className="text-xs text-muted-foreground">{concept.description}</p>}
          </div>

          {/* Target repo selector */}
          <div className="space-y-2">
            <span className="text-sm font-medium">Target Repository</span>
            <Select value={targetRepoId} onValueChange={setTargetRepoId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a repository..." />
              </SelectTrigger>
              <SelectContent>
                {availableRepos.map((repo) => (
                  <SelectItem key={repo.id} value={repo.id}>
                    {repo.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Sync to disk checkbox */}
          <div className="flex items-center gap-2">
            <Checkbox id="sync-to-disk" checked={syncToDisk} onCheckedChange={(v) => setSyncToDisk(v === true)} />
            <label htmlFor="sync-to-disk" className="text-sm cursor-pointer">
              Also sync files to disk
            </label>
          </div>

          {/* Target path preview */}
          {targetRepoId && syncToDisk && (
            <div className="text-xs text-muted-foreground">
              <span className="font-medium">Will {isMerge ? "merge into" : "create"}:</span>{" "}
              <code className="bg-muted px-1 py-0.5 rounded">{getTargetPath(concept)}</code>
            </div>
          )}

          {isMerge && syncToDisk && (
            <p className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
              This will merge into the existing settings file. Existing entries will not be overwritten.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleLink} disabled={!targetRepoId || installing}>
            <Link2 className="w-4 h-4 mr-1.5" />
            {installing ? "Linking..." : syncToDisk ? "Link & Sync" : "Link"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
