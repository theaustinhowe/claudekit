"use client";

import { cn } from "@claudekit/ui";
import { Button } from "@claudekit/ui/components/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@claudekit/ui/components/tooltip";
import { Check, ChevronsUpDown, GitBranch, Plus } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRepositoryContext } from "@/contexts/repository-context";

interface RepoSelectorProps {
  collapsed?: boolean;
  className?: string;
}

export function RepoSelector({ collapsed = false, className }: RepoSelectorProps) {
  const { repositories, selectedRepoId, setSelectedRepoId, isLoading } = useRepositoryContext();
  const [open, setOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const optionIds = useMemo(() => ["all", ...repositories.map((r) => r.id)], [repositories]);

  const handleSelect = useCallback(
    (id: string) => {
      setSelectedRepoId(id);
      setOpen(false);
    },
    [setSelectedRepoId],
  );

  useEffect(() => {
    if (open && dropdownRef.current) {
      dropdownRef.current.focus();
      const currentIndex = optionIds.indexOf(selectedRepoId);
      setFocusedIndex(currentIndex >= 0 ? currentIndex : 0);
    }
  }, [open, optionIds, selectedRepoId]);

  const handleDropdownKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setFocusedIndex((prev) => (prev < optionIds.length - 1 ? prev + 1 : 0));
          break;
        case "ArrowUp":
          e.preventDefault();
          setFocusedIndex((prev) => (prev > 0 ? prev - 1 : optionIds.length - 1));
          break;
        case "Enter":
        case " ":
          e.preventDefault();
          if (focusedIndex >= 0 && focusedIndex < optionIds.length) {
            handleSelect(optionIds[focusedIndex]);
          }
          break;
        case "Escape":
          e.preventDefault();
          setOpen(false);
          break;
      }
    },
    [focusedIndex, optionIds, handleSelect],
  );

  // If collapsed, show icon-only with tooltip
  if (collapsed) {
    const selectedRepo = selectedRepoId === "all" ? null : repositories.find((r) => r.id === selectedRepoId);

    const displayLetter = selectedRepo ? (selectedRepo.displayName || selectedRepo.name).charAt(0).toUpperCase() : "A";

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-9 w-9", className)}
            onClick={() => setOpen(!open)}
            disabled={isLoading}
          >
            <span className="text-sm font-semibold">{displayLetter}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">
          <p>
            {selectedRepoId === "all"
              ? "All Repositories"
              : selectedRepo?.displayName || `${selectedRepo?.owner}/${selectedRepo?.name}`}
          </p>
        </TooltipContent>
      </Tooltip>
    );
  }

  // If only one repository, show a simpler display with add option
  if (repositories.length <= 1) {
    const repo = repositories[0];

    return (
      <div className={cn("relative", className)}>
        <Button
          variant="ghost"
          className="w-full justify-between gap-2 px-3"
          onClick={() => setOpen(!open)}
          disabled={isLoading}
        >
          <div className="flex items-center gap-2 truncate">
            <GitBranch className="h-4 w-4 shrink-0" />
            <span className="truncate text-sm">
              {repo ? repo.displayName || `${repo.owner}/${repo.name}` : "No repository"}
            </span>
          </div>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>

        {open && (
          <>
            <button
              type="button"
              className="fixed inset-0 z-40 cursor-default"
              onClick={() => setOpen(false)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setOpen(false);
              }}
              tabIndex={-1}
              aria-label="Close dropdown"
            />
            <div className="absolute top-full left-0 z-50 mt-1 w-full rounded-md border bg-popover p-1 shadow-md">
              {repo && (
                <div className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-muted-foreground">
                  <GitBranch className="h-4 w-4" />
                  <span className="flex-1 truncate text-left">{repo.displayName || `${repo.owner}/${repo.name}`}</span>
                  <Check className="h-4 w-4" />
                </div>
              )}
              <hr className="my-1 border-0 h-px bg-border" />
              <Link
                href="/setup"
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                onClick={() => setOpen(false)}
              >
                <Plus className="h-4 w-4" />
                <span className="flex-1 text-left">Add repository...</span>
              </Link>
            </div>
          </>
        )}
      </div>
    );
  }

  const selectedRepo = selectedRepoId === "all" ? null : repositories.find((r) => r.id === selectedRepoId);

  const displayText =
    selectedRepoId === "all"
      ? "All Repositories"
      : selectedRepo?.displayName || `${selectedRepo?.owner}/${selectedRepo?.name}` || "Select repository";

  return (
    <div className={cn("relative", className)}>
      <Button
        variant="ghost"
        className="w-full justify-between gap-2 px-3"
        onClick={() => setOpen(!open)}
        disabled={isLoading}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2 truncate">
          <GitBranch className="h-4 w-4 shrink-0" />
          <span className="truncate text-sm">{displayText}</span>
        </div>
        <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
      </Button>

      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
            tabIndex={-1}
            aria-label="Close dropdown"
          />
          <div
            ref={dropdownRef}
            role="listbox"
            aria-label="Select repository"
            tabIndex={0}
            onKeyDown={handleDropdownKeyDown}
            className="absolute top-full left-0 z-50 mt-1 w-full rounded-md border bg-popover p-1 shadow-md outline-none"
          >
            <button
              type="button"
              role="option"
              aria-selected={selectedRepoId === "all"}
              className={cn(
                "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent",
                focusedIndex === 0 && "bg-accent",
              )}
              onClick={() => handleSelect("all")}
              onMouseEnter={() => setFocusedIndex(0)}
            >
              <Check className={`h-4 w-4 ${selectedRepoId === "all" ? "opacity-100" : "opacity-0"}`} />
              <span className="flex-1 text-left">All Repositories</span>
              <span className="text-xs text-muted-foreground">{repositories.length}</span>
            </button>

            <hr className="my-1 border-0 h-px bg-border" />

            {repositories.map((repo, index) => (
              <button
                key={repo.id}
                type="button"
                role="option"
                aria-selected={selectedRepoId === repo.id}
                className={cn(
                  "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent",
                  focusedIndex === index + 1 && "bg-accent",
                )}
                onClick={() => handleSelect(repo.id)}
                onMouseEnter={() => setFocusedIndex(index + 1)}
              >
                <Check className={`h-4 w-4 ${selectedRepoId === repo.id ? "opacity-100" : "opacity-0"}`} />
                <span className="flex-1 truncate text-left">{repo.displayName || `${repo.owner}/${repo.name}`}</span>
              </button>
            ))}

            <hr className="my-1 border-0 h-px bg-border" />

            <Link
              href="/setup"
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
              onClick={() => setOpen(false)}
            >
              <Plus className="h-4 w-4" />
              <span className="flex-1 text-left">Add repository...</span>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
