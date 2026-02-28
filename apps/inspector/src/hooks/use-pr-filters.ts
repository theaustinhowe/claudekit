import { useMemo, useState } from "react";
import type { PRFilters, PRSortDirection, PRSortField, PRWithComments } from "@/lib/types";

interface UsePRFiltersOptions {
  defaultSortField?: PRSortField;
  defaultSortDirection?: PRSortDirection;
}

export function usePRFilters(prs: PRWithComments[], options: UsePRFiltersOptions = {}) {
  const { defaultSortField = "created", defaultSortDirection = "desc" } = options;

  const [filters, setFilters] = useState<PRFilters>({
    search: "",
    state: "all",
    size: "all",
    sortField: defaultSortField,
    sortDirection: defaultSortDirection,
  });

  const setSearch = (search: string) => setFilters((f) => ({ ...f, search }));
  const setState = (state: PRFilters["state"]) => setFilters((f) => ({ ...f, state }));
  const setSize = (size: PRFilters["size"]) => setFilters((f) => ({ ...f, size }));
  const setSortField = (sortField: PRSortField) => setFilters((f) => ({ ...f, sortField }));
  const toggleDirection = () =>
    setFilters((f) => ({ ...f, sortDirection: f.sortDirection === "asc" ? "desc" : "asc" }));

  const filtered = useMemo(() => {
    let result = prs;

    // Search filter
    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(
        (pr) =>
          pr.title.toLowerCase().includes(q) || pr.author.toLowerCase().includes(q) || String(pr.number).includes(q),
      );
    }

    // State filter
    if (filters.state !== "all") {
      result = result.filter((pr) => pr.state === filters.state);
    }

    // Size filter
    if (filters.size !== "all") {
      result = result.filter((pr) => pr.size === filters.size);
    }

    // Sort
    const dir = filters.sortDirection === "asc" ? 1 : -1;
    result = [...result].sort((a, b) => {
      switch (filters.sortField) {
        case "created":
          return dir * (a.githubCreatedAt ?? "").localeCompare(b.githubCreatedAt ?? "");
        case "updated":
          return dir * (a.githubUpdatedAt ?? "").localeCompare(b.githubUpdatedAt ?? "");
        case "size":
          return dir * (a.linesAdded + a.linesDeleted - (b.linesAdded + b.linesDeleted));
        case "comments":
          return dir * (a.commentCount - b.commentCount);
        case "title":
          return dir * a.title.localeCompare(b.title);
        default:
          return 0;
      }
    });

    return result;
  }, [prs, filters]);

  return {
    filters,
    filtered,
    setSearch,
    setState,
    setSize,
    setSortField,
    toggleDirection,
  };
}
