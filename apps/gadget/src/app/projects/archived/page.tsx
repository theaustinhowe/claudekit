import { Button } from "@devkit/ui/components/button";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ProjectCard } from "@/components/generator/project-card";
import { PageBanner } from "@/components/layout/page-banner";
import { getGeneratorProjects } from "@/lib/actions/generator-projects";
import { getLatestScreenshot } from "@/lib/actions/screenshots";
import type { GeneratorProjectStatus } from "@/lib/types";

export const metadata: Metadata = { title: "Archived Projects" };

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

export default async function ArchivedProjectsPage() {
  const projects = await getGeneratorProjects();
  const archivedProjects = projects.filter((p) => p.status === "archived");

  const screenshotMap = new Map<string, string | null>();
  await Promise.all(
    archivedProjects.map(async (p) => {
      const screenshot = await getLatestScreenshot(p.id);
      screenshotMap.set(p.id, screenshot?.id ?? null);
    }),
  );

  return (
    <div className="flex h-full flex-col">
      <PageBanner
        title="Archived Projects"
        count={archivedProjects.length}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/projects">
              <ArrowLeft className="w-4 h-4 mr-1.5" />
              Active Projects
            </Link>
          </Button>
        }
      />
      <div className="flex-1 overflow-auto">
        <div className="p-6 max-w-4xl mx-auto">
          {archivedProjects.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <p>No archived projects yet.</p>
            </div>
          ) : (
            <div className="space-y-0">
              {archivedProjects.map((project) => (
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
