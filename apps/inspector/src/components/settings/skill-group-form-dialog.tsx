"use client";

import { Button } from "@claudekit/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@claudekit/ui/components/dialog";
import { Input } from "@claudekit/ui/components/input";
import { Label } from "@claudekit/ui/components/label";
import { Textarea } from "@claudekit/ui/components/textarea";
import { Loader2 } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { createSkillGroup, updateSkillGroup } from "@/lib/actions/skill-groups";
import type { SkillGroup } from "@/lib/types";

interface SkillGroupFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group?: SkillGroup;
  onSaved: (group: SkillGroup) => void;
}

export function SkillGroupFormDialog({ open, onOpenChange, group, onSaved }: SkillGroupFormDialogProps) {
  const isEdit = !!group;
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (open) {
      setName(group?.name ?? "");
      setCategory(group?.category ?? "");
      setDescription(group?.description ?? "");
    }
  }, [open, group]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedCategory = category.trim();
    if (!trimmedName || !trimmedCategory) {
      toast.error("Name and category are required");
      return;
    }

    startTransition(async () => {
      try {
        if (isEdit) {
          await updateSkillGroup(group.id, trimmedName, trimmedCategory, description.trim() || undefined);
          const updated: SkillGroup = {
            ...group,
            name: trimmedName,
            category: trimmedCategory,
            description: description.trim() || null,
            updatedAt: new Date().toISOString(),
          };
          onSaved(updated);
          toast.success("Skill group updated");
        } else {
          const created = await createSkillGroup(trimmedName, trimmedCategory, description.trim() || undefined);
          onSaved(created);
          toast.success("Skill group created");
        }
        onOpenChange(false);
      } catch (err) {
        toast.error(isEdit ? "Failed to update skill group" : "Failed to create skill group", {
          description: err instanceof Error ? err.message : "Unknown error",
        });
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{isEdit ? "Edit Skill Group" : "Create Skill Group"}</DialogTitle>
            <DialogDescription>
              {isEdit ? "Update the skill group details." : "Add a new skill group to organize your skills."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="sg-name">Name</Label>
              <Input
                id="sg-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Error Handling Patterns"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sg-category">Category</Label>
              <Input
                id="sg-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g. code-quality"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sg-description">Description (optional)</Label>
              <Textarea
                id="sg-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what this skill group covers..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {isEdit ? "Save Changes" : "Create Group"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
