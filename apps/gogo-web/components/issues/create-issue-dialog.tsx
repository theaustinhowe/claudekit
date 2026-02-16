"use client";

import { Button } from "@devkit/ui/components/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@devkit/ui/components/dialog";
import { Input } from "@devkit/ui/components/input";
import { Label } from "@devkit/ui/components/label";
import { Textarea } from "@devkit/ui/components/textarea";
import { Loader2, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface CreateIssueDialogProps {
  onSubmit: (data: { title: string; body?: string; labels?: string[] }) => void;
  isLoading?: boolean;
  compact?: boolean;
}

export function CreateIssueDialog({ onSubmit, isLoading = false, compact = false }: CreateIssueDialogProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [labelsInput, setLabelsInput] = useState("");
  const submittedRef = useRef(false);

  // Auto-close dialog when a submission's loading finishes successfully.
  // We track whether we initiated a submit to avoid closing on unrelated re-renders.
  useEffect(() => {
    if (submittedRef.current && !isLoading) {
      submittedRef.current = false;
      setOpen(false);
      setTitle("");
      setBody("");
      setLabelsInput("");
    }
  }, [isLoading]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      return;
    }

    // Parse labels: comma-separated
    const labels = labelsInput
      .split(",")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    submittedRef.current = true;

    onSubmit({
      title: title.trim(),
      body: body.trim() || undefined,
      labels: labels.length > 0 ? labels : undefined,
    });
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!isLoading) {
      setOpen(newOpen);
      if (!newOpen) {
        // Reset form when closing
        setTitle("");
        setBody("");
        setLabelsInput("");
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button {...(compact ? { size: "sm" as const, className: "h-7 px-3 gap-1.5" } : { className: "gap-2" })}>
          <Plus className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
          Create Issue
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create New Issue</DialogTitle>
            <DialogDescription>Create a new GitHub issue in this repository.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="title">
                  Title <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Issue title"
                  required
                  disabled={isLoading}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="body">Description</Label>
                <Textarea
                  id="body"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Describe the issue in detail..."
                  rows={5}
                  disabled={isLoading}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="labels">Labels</Label>
                <Input
                  id="labels"
                  value={labelsInput}
                  onChange={(e) => setLabelsInput(e.target.value)}
                  placeholder="bug, enhancement, documentation"
                  disabled={isLoading}
                />
                <p className="text-xs text-muted-foreground">Comma-separated list of labels to add to the issue</p>
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || !title.trim()}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Issue"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
