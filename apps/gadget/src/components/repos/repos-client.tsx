"use client";

import {
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  FolderGit2,
  Loader2,
  Play,
  Search,
  Trash2,
} from "lucide-react";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@devkit/ui/components/alert-dialog";
import { Badge } from "@devkit/ui/components/badge";
import { Button } from "@devkit/ui/components/button";
import { Card, CardContent } from "@devkit/ui/components/card";
import { Checkbox } from "@devkit/ui/components/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@devkit/ui/components/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@devkit/ui/components/table";
import { deleteRepos } from "@/lib/actions/repos";
import type { RepoWithCounts } from "@/lib/types";
import { formatNumber } from "@/lib/utils";

type SortColumn = "name" | "repo_type" | "package_manager" | "last_scanned_at" | "last_modified_at" | "issues";
type SortDirection = "asc" | "desc";

interface ReposClientProps {
  repos: RepoWithCounts[];
}

function SortableHeader({
  column,
  label,
  currentColumn,
  currentDirection,
  onToggle,
  className,
}: {
  column: SortColumn;
  label: string;
  currentColumn: SortColumn | null;
  currentDirection: SortDirection;
  onToggle: (column: SortColumn) => void;
  className?: string;
}) {
  const isActive = currentColumn === column;
  return (
    <TableHead className={className}>
      <button
        type="button"
        className="flex items-center gap-1 hover:text-foreground transition-colors -ml-1 px-1"
        onClick={() => onToggle(column)}
        aria-label={`Sort by ${label}${isActive ? (currentDirection === "asc" ? ", ascending" : ", descending") : ""}`}
      >
        {label}
        {isActive ? (
          currentDirection === "asc" ? (
            <ChevronUp className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )
        ) : (
          <ArrowUpDown className="w-3.5 h-3.5 opacity-40" />
        )}
      </button>
    </TableHead>
  );
}

export function ReposClient({ repos }: ReposClientProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRepos, setSelectedRepos] = useState<string[]>([]);
  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const { deleted } = await deleteRepos(selectedRepos);
      toast.success(`Removed ${formatNumber(deleted)} repositories`);
      setSelectedRepos([]);
      setShowDeleteDialog(false);
      router.refresh();
    } catch {
      toast.error("Failed to remove repositories");
    } finally {
      setIsDeleting(false);
    }
  };

  const toggleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const filteredRepos = repos.filter(
    (repo) =>
      repo.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      repo.local_path.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const sortedRepos = useMemo(() => {
    if (!sortColumn) return filteredRepos;
    const sorted = [...filteredRepos].sort((a, b) => {
      let cmp = 0;
      switch (sortColumn) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "repo_type":
          cmp = (a.repo_type || "").localeCompare(b.repo_type || "");
          break;
        case "package_manager":
          cmp = (a.package_manager || "").localeCompare(b.package_manager || "");
          break;
        case "last_scanned_at":
          cmp = (a.last_scanned_at || "").localeCompare(b.last_scanned_at || "");
          break;
        case "last_modified_at":
          cmp = (a.last_modified_at || "").localeCompare(b.last_modified_at || "");
          break;
        case "issues":
          cmp = a.critical_count + a.warning_count - (b.critical_count + b.warning_count);
          break;
      }
      return sortDirection === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [filteredRepos, sortColumn, sortDirection]);

  const toggleSelectAll = () => {
    if (selectedRepos.length === filteredRepos.length) {
      setSelectedRepos([]);
    } else {
      setSelectedRepos(filteredRepos.map((r) => r.id));
    }
  };

  const toggleRepo = (repoId: string) => {
    setSelectedRepos((prev) => (prev.includes(repoId) ? prev.filter((id) => id !== repoId) : [...prev, repoId]));
  };

  const getRepoTypeColor = (type: string) => {
    switch (type) {
      case "nextjs":
        return "bg-black text-white dark:bg-white dark:text-black";
      case "react":
        return "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400";
      case "node":
        return "bg-green-500/10 text-green-600 dark:text-green-400";
      case "monorepo":
        return "bg-purple-500/10 text-purple-600 dark:text-purple-400";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Repositories</h1>
          <p className="text-muted-foreground text-sm">{formatNumber(repos.length)} repositories audited</p>
        </div>
        <Button onClick={() => router.push("/scans/new")} className="w-full sm:w-auto">
          <Play className="w-4 h-4 mr-2" />
          New Scan
        </Button>
      </div>

      {/* Search and filters */}
      <div className="flex items-center gap-2 sm:gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search repos, paths..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            aria-label="Search repositories"
          />
        </div>
      </div>

      {/* Empty States */}
      {repos.length === 0 && !searchQuery && (
        <EmptyState
          icon={FolderGit2}
          title="No repositories discovered yet"
          description="Run a scan to discover repos in your workspace, or connect your GitHub account to sync repos."
          actions={[{ label: "New Scan", href: "/scans/new" }]}
        />
      )}

      {repos.length > 0 && filteredRepos.length === 0 && searchQuery && (
        <div className="text-center py-12 space-y-3">
          <Search className="w-8 h-8 text-muted-foreground/40 mx-auto" />
          <p className="text-muted-foreground">No repositories match &ldquo;{searchQuery}&rdquo;</p>
          <Button variant="ghost" size="sm" onClick={() => setSearchQuery("")}>
            Clear search
          </Button>
        </div>
      )}

      {filteredRepos.length > 0 && (
        <>
          {/* Bulk actions */}
          {selectedRepos.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 p-3 bg-muted rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2"
            >
              <span className="text-sm">{formatNumber(selectedRepos.length)} repositories selected</span>
              <div className="flex gap-2 w-full sm:w-auto">
                <Button
                  size="sm"
                  variant="destructive"
                  className="flex-1 sm:flex-none"
                  onClick={() => setShowDeleteDialog(true)}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Remove
                </Button>
              </div>
            </motion.div>
          )}

          <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove {formatNumber(selectedRepos.length)} repositories?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will remove the selected repositories and all associated findings, fixes, and concepts from
                  Gadget. The actual files on disk will not be affected.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={handleDelete}
                  disabled={isDeleting}
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Removing...
                    </>
                  ) : (
                    "Remove"
                  )}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Mobile: Card layout */}
          <div className="block md:hidden space-y-3">
            {sortedRepos.map((repo) => (
              <Card key={repo.id} className="overflow-hidden">
                <CardContent className="p-0">
                  {/* biome-ignore lint/a11y/useSemanticElements: contains nested Checkbox */}
                  <div
                    role="button"
                    tabIndex={0}
                    className="p-4 cursor-pointer hover:bg-muted/50 transition-colors w-full text-left"
                    onClick={() => router.push(`/repositories/${repo.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        router.push(`/repositories/${repo.id}`);
                      }
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={selectedRepos.includes(repo.id)}
                        onCheckedChange={() => toggleRepo(repo.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-1"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <FolderGit2 className="w-4 h-4 text-muted-foreground shrink-0" />
                          <p className="font-medium truncate">{repo.name}</p>
                        </div>
                        <p className="text-xs text-muted-foreground font-mono truncate mb-2">{repo.local_path}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {repo.repo_type && (
                            <Badge className={getRepoTypeColor(repo.repo_type)} variant="secondary">
                              {repo.repo_type}
                            </Badge>
                          )}
                          {repo.package_manager && (
                            <Badge variant="outline" className="capitalize">
                              {repo.package_manager}
                            </Badge>
                          )}
                          {repo.last_modified_at && (
                            <Badge variant="outline" className="text-xs">
                              Modified {new Date(repo.last_modified_at).toLocaleDateString()}
                            </Badge>
                          )}
                          {repo.critical_count > 0 && (
                            <Badge variant="destructive">{formatNumber(repo.critical_count)} critical</Badge>
                          )}
                          {repo.warning_count > 0 && (
                            <Badge variant="secondary" className="bg-warning/10 text-warning">
                              {formatNumber(repo.warning_count)} warn
                            </Badge>
                          )}
                          {repo.critical_count === 0 && repo.warning_count === 0 && (
                            <Badge variant="secondary">Clean</Badge>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Desktop: Table layout */}
          <Card className="hidden md:block">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={selectedRepos.length === filteredRepos.length && filteredRepos.length > 0}
                        onCheckedChange={toggleSelectAll}
                        aria-label={
                          selectedRepos.length === filteredRepos.length
                            ? "Deselect all repositories"
                            : "Select all repositories"
                        }
                      />
                    </TableHead>
                    <SortableHeader
                      column="name"
                      label="Repository"
                      currentColumn={sortColumn}
                      currentDirection={sortDirection}
                      onToggle={toggleSort}
                    />
                    <SortableHeader
                      column="repo_type"
                      label="Type"
                      currentColumn={sortColumn}
                      currentDirection={sortDirection}
                      onToggle={toggleSort}
                    />
                    <SortableHeader
                      column="package_manager"
                      label="Package Manager"
                      currentColumn={sortColumn}
                      currentDirection={sortDirection}
                      onToggle={toggleSort}
                    />
                    <SortableHeader
                      column="last_scanned_at"
                      label="Last Scan"
                      currentColumn={sortColumn}
                      currentDirection={sortDirection}
                      onToggle={toggleSort}
                    />
                    <SortableHeader
                      column="last_modified_at"
                      label="Last Modified"
                      currentColumn={sortColumn}
                      currentDirection={sortDirection}
                      onToggle={toggleSort}
                    />
                    <SortableHeader
                      column="issues"
                      label="Issues"
                      currentColumn={sortColumn}
                      currentDirection={sortDirection}
                      onToggle={toggleSort}
                      className="text-right"
                    />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedRepos.map((repo) => (
                    <TableRow
                      key={repo.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => router.push(`/repositories/${repo.id}`)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedRepos.includes(repo.id)}
                          onCheckedChange={() => toggleRepo(repo.id)}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <FolderGit2 className="w-5 h-5 text-muted-foreground" />
                          <div>
                            <p className="font-medium">{repo.name}</p>
                            <p className="text-xs text-muted-foreground font-mono">{repo.local_path}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {repo.repo_type && (
                          <Badge className={getRepoTypeColor(repo.repo_type)} variant="secondary">
                            {repo.repo_type}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {repo.package_manager && (
                          <Badge variant="outline" className="capitalize">
                            {repo.package_manager}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {repo.last_scanned_at ? new Date(repo.last_scanned_at).toLocaleDateString() : "Never"}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {repo.last_modified_at ? new Date(repo.last_modified_at).toLocaleDateString() : "\u2014"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {repo.critical_count > 0 && (
                            <Badge variant="destructive">{formatNumber(repo.critical_count)}</Badge>
                          )}
                          {repo.warning_count > 0 && (
                            <Badge variant="secondary" className="bg-warning/10 text-warning">
                              {formatNumber(repo.warning_count)}
                            </Badge>
                          )}
                          {repo.critical_count === 0 && repo.warning_count === 0 && (
                            <Badge variant="secondary">Clean</Badge>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
