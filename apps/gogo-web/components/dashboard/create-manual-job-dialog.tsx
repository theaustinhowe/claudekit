"use client";

import { Loader2, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@devkit/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@devkit/ui/components/dialog";
import { Input } from "@devkit/ui/components/input";
import { Label } from "@devkit/ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@devkit/ui/components/select";
import { Textarea } from "@devkit/ui/components/textarea";
import { useCreateManualJob } from "@/hooks/use-jobs";
import { useRepositories } from "@/hooks/use-repositories";

interface CreateManualJobDialogProps {
  defaultRepositoryId?: string;
}

export function CreateManualJobDialog({ defaultRepositoryId }: CreateManualJobDialogProps) {
  const { data: repositories = [] } = useRepositories();
  const { mutate: createJob, isPending } = useCreateManualJob();

  const [open, setOpen] = useState(false);
  const [repositoryId, setRepositoryId] = useState(defaultRepositoryId ?? "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const activeRepos = repositories.filter((r) => r.isActive);
  const hasDefaultRepo = !!defaultRepositoryId;
  const selectedRepo = activeRepos.find((r) => r.id === defaultRepositoryId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!repositoryId || !title.trim()) return;

    createJob(
      {
        repositoryId,
        title: title.trim(),
        description: description.trim() || undefined,
      },
      {
        onSuccess: (response) => {
          if (response.data) {
            toast.success("Job Created", {
              description: `Manual job "${title.trim()}" has been queued.`,
            });
            setOpen(false);
            setTitle("");
            setDescription("");
          } else if (response.error) {
            toast.error("Failed to create job", {
              description: response.error,
            });
          }
        },
        onError: (err) => {
          toast.error("Failed to create job", { description: err.message });
        },
      },
    );
  };

  // Reset form when dialog opens
  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (newOpen) {
      setRepositoryId(defaultRepositoryId ?? "");
      setTitle("");
      setDescription("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-7 px-3 gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          New Job
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create Manual Job</DialogTitle>
            <DialogDescription>
              Create a job without a GitHub issue. The agent will work in a worktree and can create PRs.
            </DialogDescription>
          </DialogHeader>
          {hasDefaultRepo && (
            <div className="flex items-center gap-2 pt-2 text-xs">
              <span className="text-muted-foreground">Repo</span>
              <span className="rounded-md bg-muted px-2 py-0.5 font-mono font-medium">
                {selectedRepo?.displayName ||
                  (selectedRepo ? `${selectedRepo.owner}/${selectedRepo.name}` : defaultRepositoryId)}
              </span>
            </div>
          )}
          <div className="space-y-4 py-4">
            {!hasDefaultRepo && (
              <div className="space-y-2">
                <Label htmlFor="repository">
                  Repository <span className="text-red-500">*</span>
                </Label>
                <Select value={repositoryId} onValueChange={setRepositoryId}>
                  <SelectTrigger id="repository">
                    <SelectValue placeholder="Select a repository" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeRepos.map((repo) => (
                      <SelectItem key={repo.id} value={repo.id}>
                        {repo.displayName || `${repo.owner}/${repo.name}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="title">
                Title <span className="text-red-500">*</span>
              </Label>
              <Input
                id="title"
                placeholder="What should the agent do?"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={500}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">
                Description <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Textarea
                id="description"
                placeholder="Additional context, requirements, or constraints..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="min-h-[100px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !repositoryId || !title.trim()}>
              {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Job
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
