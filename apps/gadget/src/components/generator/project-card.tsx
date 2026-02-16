"use client";

import { ExternalLink, Monitor } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@devkit/ui/components/badge";
import { Card, CardContent } from "@devkit/ui/components/card";
import type { GeneratorProject, GeneratorProjectStatus } from "@/lib/types";
import { timeAgo } from "@/lib/utils";

interface ProjectCardProps {
  project: GeneratorProject;
  statusColors: Record<GeneratorProjectStatus, string>;
  screenshotId: string | null;
}

export function ProjectCard({ project, statusColors, screenshotId }: ProjectCardProps) {
  const router = useRouter();

  return (
    <Link href={`/projects/${project.id}`}>
      <Card className="hover:border-primary/50 transition-colors cursor-pointer mb-4">
        <CardContent className="p-4 flex items-start gap-4">
          {/* Screenshot thumbnail or placeholder */}
          <div className="shrink-0 w-[140px] h-[88px] rounded-md overflow-hidden bg-muted flex items-center justify-center">
            {screenshotId ? (
              // biome-ignore lint/performance/noImgElement: dynamic API-served screenshots
              <img
                src={`/api/projects/${project.id}/screenshots/${screenshotId}`}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="text-muted-foreground/30">
                <Monitor className="w-8 h-8" />
              </div>
            )}
          </div>

          {/* Info */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-medium truncate">{project.title}</h3>
              <Badge variant="secondary" className={statusColors[project.status]}>
                {project.status}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground truncate mt-1">{project.idea_description}</p>
            <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
              <span>{project.platform}</span>
              <span>{project.package_manager}</span>
              <span>{timeAgo(project.updated_at)}</span>
              {project.status === "archived" && project.repo_id && (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    router.push(`/repos/${project.repo_id}`);
                  }}
                >
                  <ExternalLink className="h-3 w-3" />
                  View Repo
                </button>
              )}
            </div>
            {(project.services.length > 0 || (project.custom_features && project.custom_features.length > 0)) && (
              <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                {project.services.length > 0 && (
                  <span>
                    {project.services.length} service{project.services.length !== 1 ? "s" : ""}
                  </span>
                )}
                {project.custom_features && project.custom_features.length > 0 && (
                  <span>
                    {project.custom_features.length} custom feature
                    {project.custom_features.length !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
