"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@devkit/ui/components/select";
import { GitBranch } from "lucide-react";
import type { CodeBranch } from "@/lib/types";

interface CodeBranchSwitcherProps {
  branches: CodeBranch[];
  currentBranch: string;
  onBranchChange: (branch: string) => void;
}

export function CodeBranchSwitcher({ branches, currentBranch, onBranchChange }: CodeBranchSwitcherProps) {
  if (branches.length === 0) return null;

  return (
    <Select value={currentBranch} onValueChange={onBranchChange}>
      <SelectTrigger className="max-w-[240px] min-w-[120px] w-auto h-8 text-sm">
        <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
          <GitBranch className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">
            <SelectValue placeholder="Branch" />
          </span>
        </div>
      </SelectTrigger>
      <SelectContent>
        {branches.map((branch) => (
          <SelectItem key={branch.name} value={branch.name}>
            <span className="flex items-center gap-2">
              {branch.name}
              {branch.isDefault && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">default</span>
              )}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
