import type { Metadata } from "next";
import { DescribeStep } from "@/components/generator/describe-step";
import { getScanRoots } from "@/lib/actions/scans";
import { DEFAULT_TOOLS } from "@/lib/constants/tools";
import { checkTools } from "@/lib/services/tool-checker";

export const metadata: Metadata = { title: "New Project" };

export default async function NewProjectPage() {
  const pmTools = DEFAULT_TOOLS.filter((t) => ["pnpm", "npm", "bun"].includes(t.id));
  const [scanRoots, installedPMs] = await Promise.all([getScanRoots(), checkTools(pmTools)]);

  return (
    <div className="p-6">
      <div className="mb-8 max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold">New Project</h1>
        <p className="text-muted-foreground">Describe your idea and generate a complete project scaffold</p>
      </div>
      <DescribeStep scanRoots={scanRoots} installedPMs={installedPMs} />
    </div>
  );
}
