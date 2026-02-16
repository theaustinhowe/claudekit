import type { Metadata } from "next";
import { DescribeStep } from "@/components/generator/describe-step";
import { PageBanner } from "@/components/layout/page-banner";
import { getScanRoots } from "@/lib/actions/scans";
import { DEFAULT_TOOLS } from "@/lib/constants/tools";
import { checkTools } from "@/lib/services/tool-checker";

export const metadata: Metadata = { title: "New Project" };

export default async function NewProjectPage() {
  const pmTools = DEFAULT_TOOLS.filter((t) => ["pnpm", "npm", "bun"].includes(t.id));
  const [scanRoots, installedPMs] = await Promise.all([getScanRoots(), checkTools(pmTools)]);

  return (
    <div className="flex h-full flex-col">
      <PageBanner title="New Project" />
      <div className="flex-1 overflow-auto">
        <div className="p-6">
          <DescribeStep scanRoots={scanRoots} installedPMs={installedPMs} />
        </div>
      </div>
    </div>
  );
}
