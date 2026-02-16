import { Button } from "@devkit/ui/components/button";
import { Archive, FolderKanban, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DescribeStep } from "@/components/generator/describe-step";
import { ProjectCard } from "@/components/generator/project-card";
import { getGeneratorProjects } from "@/lib/actions/generator-projects";
import { getScanRoots } from "@/lib/actions/scans";
import { getLatestScreenshot } from "@/lib/actions/screenshots";
import { DEFAULT_TOOLS } from "@/lib/constants/tools";
import { checkTools } from "@/lib/services/tool-checker";
import type { GeneratorProjectStatus } from "@/lib/types";

export const metadata: Metadata = { title: "Projects" };

const STATUS_COLORS: Record<GeneratorProjectStatus, string> = {
  drafting: "bg-blue-500/10 text-blue-600",
  scaffolding: "bg-cyan-500/10 text-cyan-600",
  designing: "bg-violet-500/10 text-violet-600",
  upgrading: "bg-amber-500/10 text-amber-600",
  archived: "bg-zinc-500/10 text-zinc-500",
  locked: "bg-purple-500/10 text-purple-600",
  exported: "bg-green-500/10 text-green-600",
  error: "bg-red-500/10 text-red-600",
};

export default async function GeneratorPage() {
  const pmTools = DEFAULT_TOOLS.filter((t) => ["pnpm", "npm", "bun"].includes(t.id));
  const [projects, scanRoots, installedPMs] = await Promise.all([
    getGeneratorProjects(),
    getScanRoots(),
    checkTools(pmTools),
  ]);

  const activeProjects = projects.filter((p) => p.status !== "archived");
  const archivedCount = projects.length - activeProjects.length;

  const screenshotMap = new Map<string, string | null>();
  await Promise.all(
    activeProjects.map(async (p) => {
      const screenshot = await getLatestScreenshot(p.id);
      screenshotMap.set(p.id, screenshot?.id ?? null);
    }),
  );

  if (projects.length === 0) {
    return (
      <div className="p-6">
        <div className="mb-8">
          <h1 className="text-2xl font-bold">Projects</h1>
          <p className="text-muted-foreground">Describe your idea and generate a complete project scaffold</p>
        </div>
        <DescribeStep scanRoots={scanRoots} installedPMs={installedPMs} />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Projects</h1>
          <p className="text-muted-foreground">
            {activeProjects.length} active project{activeProjects.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {archivedCount > 0 && (
            <Button variant="outline" size="sm" asChild>
              <Link href="/projects/archived">
                <Archive className="w-3.5 h-3.5" />
                Archived ({archivedCount})
              </Link>
            </Button>
          )}
          <Button asChild>
            <Link href="/projects/new">
              <Sparkles className="w-4 h-4" />
              New Project
            </Link>
          </Button>
        </div>
      </div>

      {activeProjects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="rounded-full bg-muted p-4 mb-4">
            <FolderKanban className="w-8 h-8 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-medium mb-1">No active projects</h2>
          <p className="text-sm text-muted-foreground mb-6 max-w-sm">
            All your projects have been archived. Create a new one to get started.
          </p>
          <Button asChild>
            <Link href="/projects/new">
              <Sparkles className="w-4 h-4" />
              New Project
            </Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-0">
          {activeProjects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              statusColors={STATUS_COLORS}
              screenshotId={screenshotMap.get(project.id) ?? null}
            />
          ))}
        </div>
      )}
    </div>
  );
}
