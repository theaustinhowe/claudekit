export interface AppDefinition {
  id: string;
  name: string;
  description: string;
  port: number;
  icon: string;
  favicon?: string;
  maturityPercentage?: number;
}

export interface MaturityInfo {
  label: string;
  percentage: number;
  color: "green" | "yellow" | "red";
}

export function getMaturity(percentage: number): MaturityInfo {
  if (percentage >= 80) return { label: "Stable", percentage, color: "green" };
  if (percentage >= 40) return { label: "Beta", percentage, color: "yellow" };
  return { label: "Alpha", percentage, color: "red" };
}

export const APP_DEFINITIONS: AppDefinition[] = [
  {
    id: "inside",
    name: "Inside",
    description: "Project creation, scaffolding, design workspace",
    port: 2150,
    icon: "Sparkles",
    favicon: "/app-icons/inside.png",
    maturityPercentage: 40,
  },
  {
    id: "gadget",
    name: "Gadget",
    description: "Repository auditor, AI integrations, project scaffolding",
    port: 2100,
    icon: "Wrench",
    favicon: "/app-icons/gadget.png",
    maturityPercentage: 65,
  },
  {
    id: "gogo-web",
    name: "GoGo Web",
    description: "Job orchestration dashboard for multi-repo AI agents",
    port: 2200,
    icon: "Rocket",
    favicon: "/app-icons/gogo-web.png",
    maturityPercentage: 40,
  },
  {
    id: "b4u",
    name: "B4U",
    description: "Automated repo walkthrough video generator",
    port: 2300,
    icon: "Video",
    favicon: "/app-icons/b4u.png",
    maturityPercentage: 20,
  },
  {
    id: "inspector",
    name: "Inspector",
    description: "GitHub PR analysis, skill building, and comment resolution",
    port: 2400,
    icon: "GitPullRequest",
    favicon: "/app-icons/inspector.png",
    maturityPercentage: 55,
  },
  {
    id: "gogo-orchestrator",
    name: "GoGo Orchestrator",
    description: "Backend orchestrator for GoGo job execution",
    port: 2201,
    icon: "Cpu",
    maturityPercentage: 35,
  },
  {
    id: "storybook",
    name: "Storybook",
    description: "Interactive component library and documentation",
    port: 6006,
    icon: "BookOpen",
    maturityPercentage: 90,
  },
  {
    id: "web",
    name: "Web",
    description: "ClaudeKit dashboard, app health monitor, and log viewer",
    port: 2000,
    icon: "Monitor",
    favicon: "/app-icons/web.png",
    maturityPercentage: 85,
  },
];

/** All app IDs except "web" (which doesn't need per-app settings like auto-start). */
export const MANAGED_APP_IDS = APP_DEFINITIONS.filter((a) => a.id !== "web").map((a) => a.id);
