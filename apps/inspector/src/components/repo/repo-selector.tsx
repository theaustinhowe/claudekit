"use client";

import { cn } from "@claudekit/ui";
import { Button } from "@claudekit/ui/components/button";
import { Input } from "@claudekit/ui/components/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@claudekit/ui/components/tooltip";
import { Check, ChevronsUpDown, GitBranch, Plus, Star } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRepoContext } from "@/contexts/repo-context";

interface RepoSelectorProps {
  collapsed?: boolean;
  className?: string;
}

export function RepoSelector({ collapsed = false, className }: RepoSelectorProps) {
  const { repos, selectedRepoId, setSelectedRepoId, favorites, toggleFavorite } = useRepoContext();
  const [open, setOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [search, setSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const sortedRepos = useMemo(() => {
    const query = search.toLowerCase();
    const filtered = query
      ? repos.filter(
          (r) =>
            r.full_name.toLowerCase().includes(query) ||
            r.owner.toLowerCase().includes(query) ||
            r.name.toLowerCase().includes(query),
        )
      : repos;
    const favs = filtered.filter((r) => favorites.has(r.id)).sort((a, b) => a.full_name.localeCompare(b.full_name));
    const rest = filtered.filter((r) => !favorites.has(r.id)).sort((a, b) => a.full_name.localeCompare(b.full_name));
    return [...favs, ...rest];
  }, [repos, favorites, search]);

  const optionIds = useMemo(() => ["all", ...sortedRepos.map((r) => r.id)], [sortedRepos]);

  const handleSelect = useCallback(
    (id: string) => {
      setSelectedRepoId(id);
      setOpen(false);
      setSearch("");
    },
    [setSelectedRepoId],
  );

  useEffect(() => {
    if (open) {
      const currentIndex = optionIds.indexOf(selectedRepoId);
      setFocusedIndex(currentIndex >= 0 ? currentIndex : 0);
      // Focus search input if present, otherwise focus dropdown
      requestAnimationFrame(() => {
        if (searchInputRef.current) {
          searchInputRef.current.focus();
        } else if (dropdownRef.current) {
          dropdownRef.current.focus();
        }
      });
    } else {
      setSearch("");
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

  if (collapsed) {
    const selectedRepo = selectedRepoId === "all" ? null : repos.find((r) => r.id === selectedRepoId);
    const displayLetter = selectedRepo ? selectedRepo.name.charAt(0).toUpperCase() : "A";

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className={cn("h-9 w-9", className)} onClick={() => setOpen(!open)}>
            <span className="text-sm font-semibold">{displayLetter}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">
          <p>{selectedRepoId === "all" ? "All Repositories" : selectedRepo?.full_name}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  if (repos.length <= 1) {
    const repo = repos[0];
    return (
      <div className={cn("relative", className)}>
        <Button variant="ghost" className="w-full justify-between gap-2 px-3" onClick={() => setOpen(!open)}>
          <div className="flex items-center gap-2 truncate">
            <GitBranch className="h-4 w-4 shrink-0" />
            <span className="truncate text-sm">{repo ? repo.full_name : "No repository"}</span>
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
            <div className="absolute top-full left-0 z-50 mt-1 w-full rounded-md border bg-popover p-1 shadow-md">
              {repo && (
                <div className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-muted-foreground">
                  <GitBranch className="h-4 w-4" />
                  <span className="flex-1 truncate text-left">{repo.full_name}</span>
                  <Check className="h-4 w-4" />
                </div>
              )}
              <hr className="my-1 border-0 h-px bg-border" />
              <Link
                href="/settings"
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

  const selectedRepo = selectedRepoId === "all" ? null : repos.find((r) => r.id === selectedRepoId);
  const displayText = selectedRepoId === "all" ? "All Repositories" : (selectedRepo?.full_name ?? "Select repository");

  return (
    <div className={cn("relative", className)}>
      <Button
        variant="ghost"
        className="w-full justify-between gap-2 px-3"
        onClick={() => setOpen(!open)}
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
            {repos.length > 3 && (
              <div className="px-1 pb-1">
                <Input
                  ref={searchInputRef}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search repos..."
                  className="h-7 text-sm"
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter") {
                      handleDropdownKeyDown(e);
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      setOpen(false);
                    }
                  }}
                />
              </div>
            )}

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
              <span className="text-xs text-muted-foreground">{repos.length}</span>
            </button>

            <hr className="my-1 border-0 h-px bg-border" />

            {sortedRepos.map((repo, index) => (
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
                <span className="flex-1 truncate text-left" title={repo.full_name}>
                  {repo.full_name}
                </span>
                <button
                  type="button"
                  tabIndex={-1}
                  className="shrink-0 rounded p-0.5 hover:bg-muted"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFavorite(repo.id);
                  }}
                >
                  <Star
                    className={cn(
                      "h-3.5 w-3.5",
                      favorites.has(repo.id) ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground",
                    )}
                  />
                </button>
              </button>
            ))}

            {sortedRepos.length === 0 && (
              <div className="px-2 py-1.5 text-sm text-muted-foreground">No repos match</div>
            )}

            <hr className="my-1 border-0 h-px bg-border" />

            <Link
              href="/settings"
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
