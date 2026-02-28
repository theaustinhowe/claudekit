"use client";

import { Badge } from "@claudekit/ui/components/badge";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@claudekit/ui/components/dialog";
import { SOURCE_TYPE_LABELS } from "@/lib/constants";
import type { ConceptSourceWithStats } from "@/lib/types";
import { formatNumber, timeAgo } from "@/lib/utils";

interface ViewSourceDialogProps {
  source: ConceptSourceWithStats | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ViewSourceDialog({ source, open, onOpenChange }: ViewSourceDialogProps) {
  if (!source) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{source.name}</DialogTitle>
          <DialogDescription>Built-in source details</DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Type</span>
            <Badge variant="outline" className="text-xs">
              {SOURCE_TYPE_LABELS[source.source_type] || source.source_type}
            </Badge>
          </div>
          {source.description && (
            <div>
              <span className="text-sm text-muted-foreground">Description</span>
              <p className="text-sm mt-0.5">{source.description}</p>
            </div>
          )}
          <div>
            <span className="text-sm text-muted-foreground">Concepts</span>
            <p className="text-sm mt-0.5">
              {formatNumber(source.concept_count)} concept{source.concept_count !== 1 ? "s" : ""}
            </p>
          </div>
          {source.last_scanned_at && (
            <div>
              <span className="text-sm text-muted-foreground">Last scanned</span>
              <p className="text-sm mt-0.5">{timeAgo(source.last_scanned_at)}</p>
            </div>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
