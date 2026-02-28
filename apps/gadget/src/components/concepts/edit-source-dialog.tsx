"use client";

import { Button } from "@claudekit/ui/components/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@claudekit/ui/components/dialog";
import { Input } from "@claudekit/ui/components/input";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { updateConceptSource } from "@/lib/actions/concept-sources";
import type { ConceptSourceWithStats } from "@/lib/types";

interface EditSourceDialogProps {
  source: ConceptSourceWithStats | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditSourceDialog({ source, open, onOpenChange }: EditSourceDialogProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [listUrl, setListUrl] = useState("");

  useEffect(() => {
    if (source) {
      setName(source.name);
      setGithubUrl(source.github_url || "");
      setListUrl(source.list_url || "");
    }
  }, [source]);

  const handleSave = async () => {
    if (!source) return;
    setLoading(true);
    try {
      const updates: { name?: string; github_url?: string; list_url?: string } = {};
      if (name.trim() !== source.name) updates.name = name.trim();
      if (source.source_type === "github_repo" && githubUrl.trim() !== (source.github_url || "")) {
        updates.github_url = githubUrl.trim();
      }
      if (source.source_type === "mcp_list" && listUrl.trim() !== (source.list_url || "")) {
        updates.list_url = listUrl.trim();
      }

      if (Object.keys(updates).length === 0) {
        onOpenChange(false);
        return;
      }

      const result = await updateConceptSource(source.id, updates);
      if (result.success) {
        toast.success(result.message);
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update source");
    } finally {
      setLoading(false);
    }
  };

  if (!source) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Source</DialogTitle>
          <DialogDescription>Update the source configuration</DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="edit-source-name">
              Name
            </label>
            <Input id="edit-source-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          {source.source_type === "github_repo" && (
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="edit-github-url">
                Repository URL
              </label>
              <Input
                id="edit-github-url"
                placeholder="https://github.com/owner/repo"
                value={githubUrl}
                onChange={(e) => setGithubUrl(e.target.value)}
              />
            </div>
          )}

          {source.source_type === "mcp_list" && (
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="edit-list-url">
                JSON URL
              </label>
              <Input
                id="edit-list-url"
                placeholder="https://example.com/mcp-servers.json"
                value={listUrl}
                onChange={(e) => setListUrl(e.target.value)}
              />
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!name.trim() || loading}>
            {loading && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
