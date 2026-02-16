"use client";

import { Button } from "@devkit/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@devkit/ui/components/dialog";
import { Input } from "@devkit/ui/components/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@devkit/ui/components/tabs";
import { Github, List, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { createGitHubSource, createMcpListSource, scanConceptSource } from "@/lib/actions/concept-sources";

interface AddSourceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddSourceDialog({ open, onOpenChange }: AddSourceDialogProps) {
  const router = useRouter();
  const [tab, setTab] = useState("github");
  const [loading, setLoading] = useState(false);

  // GitHub form
  const [githubUrl, setGithubUrl] = useState("");

  // MCP list form
  const [listName, setListName] = useState("");
  const [listUrl, setListUrl] = useState("");

  const handleAddGitHub = async () => {
    if (!githubUrl.trim()) return;
    setLoading(true);
    try {
      const result = await createGitHubSource({ github_url: githubUrl.trim() });
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);

      // Auto-scan
      if (result.sourceId) {
        const scanResult = await scanConceptSource(result.sourceId);
        if (scanResult.success) {
          toast.success(scanResult.message);
        } else {
          toast.error(`Scan failed: ${scanResult.message}`);
        }
      }

      setGithubUrl("");
      onOpenChange(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add source");
    } finally {
      setLoading(false);
    }
  };

  const handleAddMcpList = async () => {
    if (!listName.trim() || !listUrl.trim()) return;
    setLoading(true);
    try {
      const result = await createMcpListSource({
        name: listName.trim(),
        list_url: listUrl.trim(),
      });
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);

      if (result.sourceId) {
        const scanResult = await scanConceptSource(result.sourceId);
        if (scanResult.success) {
          toast.success(scanResult.message);
        } else {
          toast.error(`Scan failed: ${scanResult.message}`);
        }
      }

      setListName("");
      setListUrl("");
      onOpenChange(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add source");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Source</DialogTitle>
          <DialogDescription>Add a new source to discover concepts from</DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full">
            <TabsTrigger value="github" className="flex-1">
              <Github className="w-4 h-4 mr-1.5" />
              GitHub Repo
            </TabsTrigger>
            <TabsTrigger value="mcp-list" className="flex-1">
              <List className="w-4 h-4 mr-1.5" />
              MCP List
            </TabsTrigger>
          </TabsList>

          <TabsContent value="github" className="space-y-4 mt-4">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="github-url">
                Repository URL
              </label>
              <Input
                id="github-url"
                placeholder="https://github.com/owner/repo"
                value={githubUrl}
                onChange={(e) => setGithubUrl(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Scans the repo for skills, commands, agents, hooks, MCP servers, and plugins.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddGitHub} disabled={!githubUrl.trim() || loading}>
                {loading && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
                Add & Scan
              </Button>
            </DialogFooter>
          </TabsContent>

          <TabsContent value="mcp-list" className="space-y-4 mt-4">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="list-name">
                Name
              </label>
              <Input
                id="list-name"
                placeholder="My MCP Server List"
                value={listName}
                onChange={(e) => setListName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="list-url">
                JSON URL
              </label>
              <Input
                id="list-url"
                placeholder="https://example.com/mcp-servers.json"
                value={listUrl}
                onChange={(e) => setListUrl(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                JSON format: {"{"} name, servers: [{"{"} name, command, args, env {"}"}] {"}"}
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddMcpList} disabled={!listName.trim() || !listUrl.trim() || loading}>
                {loading && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
                Add & Fetch
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
