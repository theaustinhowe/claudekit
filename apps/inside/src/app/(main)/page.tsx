import { Button } from "@claudekit/ui/components/button";
import { Archive, FolderKanban, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DescribeStep } from "@/components/generator/describe-step";
import { ProjectCard } from "@/components/generator/project-card";
import { PageBanner } from "@/components/layout/page-banner";
import { getGeneratorProjects } from "@/lib/actions/generator-projects";
import { getLatestScreenshot } from "@/lib/actions/screenshots";
import { getSetting } from "@/lib/actions/settings";
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

export default async function ProjectsPage() {
  const pmTools = DEFAULT_TOOLS.filter((t) => ["pnpm", "npm", "bun"].includes(t.id));
  const [projects, defaultPath, installedPMs] = await Promise.all([
    getGeneratorProjects(),
    getSetting("default_project_path").then((v) => v ?? process.env.NEXT_PUBLIC_DEFAULT_DIRECTORY ?? "~/Projects"),
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
      <div className="flex h-full flex-col">
        <PageBanner title="Projects" />
        <div className="flex-1 overflow-auto">
          <div className="p-6">
            <DescribeStep defaultPath={defaultPath} installedPMs={installedPMs} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <PageBanner
        title="Projects"
        count={activeProjects.length}
        actions={
          <>
            {archivedCount > 0 && (
              <Button variant="outline" size="sm" asChild>
                <Link href="/archived">
                  <Archive className="w-3.5 h-3.5" />
                  Archived ({archivedCount})
                </Link>
              </Button>
            )}
            <Button size="sm" asChild>
              <Link href="/new">
                <Sparkles className="w-4 h-4" />
                New Project
              </Link>
            </Button>
          </>
        }
      />
      <div className="flex-1 overflow-auto">
        <div className="p-6 max-w-4xl mx-auto">
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
                <Link href="/new">
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
      </div>
    </div>
  );
}
