"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@devkit/ui/components/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@devkit/ui/components/dialog";
import { Input } from "@devkit/ui/components/input";
import { Label } from "@devkit/ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@devkit/ui/components/select";
import { Textarea } from "@devkit/ui/components/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@devkit/ui/components/tooltip";
import type { FindingCategory, ManualFinding, Severity } from "@/lib/types";

interface ManualFindingFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialData?: ManualFinding;
  onSubmit: (data: ManualFindingFormData) => void;
  isSubmitting: boolean;
}

export interface ManualFindingFormData {
  title: string;
  details: string;
  severity: Severity;
  category: FindingCategory;
  evidence: string;
  suggested_actions: string[];
}

const SEVERITIES: Severity[] = ["critical", "warning", "info"];
const CATEGORIES: FindingCategory[] = ["custom", "structure", "config", "dependencies", "ai-files"];

export function ManualFindingForm({ open, onOpenChange, initialData, onSubmit, isSubmitting }: ManualFindingFormProps) {
  const [title, setTitle] = useState(initialData?.title ?? "");
  const [details, setDetails] = useState(initialData?.details ?? "");
  const [severity, setSeverity] = useState<Severity>(initialData?.severity ?? "warning");
  const [category, setCategory] = useState<FindingCategory>(initialData?.category ?? "custom");
  const [evidence, setEvidence] = useState(initialData?.evidence ?? "");
  const [suggestedActions, setSuggestedActions] = useState<string[]>(
    initialData?.suggested_actions?.length ? initialData.suggested_actions : [""],
  );

  const handleSubmit = () => {
    if (!title.trim()) return;
    onSubmit({
      title: title.trim(),
      details: details.trim(),
      severity,
      category,
      evidence: evidence.trim(),
      suggested_actions: suggestedActions.filter((a) => a.trim()),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initialData ? "Edit Finding" : "Add Manual Finding"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Title *</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Missing error boundary"
              className="mt-1"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Severity</Label>
              <Select value={severity} onValueChange={(v) => setSeverity(v as Severity)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SEVERITIES.map((s) => (
                    <SelectItem key={s} value={s} className="capitalize">
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as FindingCategory)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c} className="capitalize">
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Details</Label>
            <Textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Describe the issue in detail"
              className="mt-1"
              rows={3}
            />
          </div>

          <div>
            <Label>Evidence</Label>
            <Textarea
              value={evidence}
              onChange={(e) => setEvidence(e.target.value)}
              placeholder="File paths, code snippets, or other evidence"
              className="mt-1 font-mono text-sm"
              rows={2}
            />
          </div>

          <div>
            <Label className="mb-2 block">Suggested Actions</Label>
            {suggestedActions.map((action, i) => (
              <div key={`action-${action || i}`} className="flex gap-2 mb-2">
                <Input
                  value={action}
                  onChange={(e) => {
                    const next = [...suggestedActions];
                    next[i] = e.target.value;
                    setSuggestedActions(next);
                  }}
                  placeholder="e.g. Add error boundary component"
                  className="flex-1"
                />
                {suggestedActions.length > 1 && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setSuggestedActions(suggestedActions.filter((_, j) => j !== i))}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Remove</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setSuggestedActions([...suggestedActions, ""])}>
              <Plus className="w-4 h-4 mr-1" /> Add Action
            </Button>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitting || !title.trim()}>
              {isSubmitting ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
