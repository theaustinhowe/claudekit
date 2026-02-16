import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DesignWorkspace } from "@/components/generator/design-workspace";
import { getDesignMessages, getGeneratorProject } from "@/lib/actions/generator-projects";

export const metadata: Metadata = { title: "Design Workspace" };

interface DesignPageProps {
  params: Promise<{ projectId: string }>;
}

export default async function DesignPage({ params }: DesignPageProps) {
  const { projectId } = await params;

  const project = await getGeneratorProject(projectId);
  if (!project) notFound();

  const messages = await getDesignMessages(projectId);

  return <DesignWorkspace project={project} initialMessages={messages} />;
}
