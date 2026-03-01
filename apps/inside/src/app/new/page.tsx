import type { Metadata } from "next";
import { Suspense } from "react";
import { DescribeStep } from "@/components/generator/describe-step";
import { getSetting } from "@/lib/actions/settings";
import { DEFAULT_TOOLS } from "@/lib/constants/tools";
import { checkTools } from "@/lib/services/tool-checker";

export const metadata: Metadata = { title: "New Project" };

export default async function NewProjectPage() {
  const pmTools = DEFAULT_TOOLS.filter((t) => ["pnpm", "npm", "bun"].includes(t.id));
  const [defaultPath, installedPMs] = await Promise.all([
    getSetting("default_project_path").then((v) => v ?? process.env.NEXT_PUBLIC_DEFAULT_DIRECTORY ?? "~/Projects"),
    checkTools(pmTools),
  ]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-auto">
        <div className="p-6">
          <Suspense>
            <DescribeStep defaultPath={defaultPath} installedPMs={installedPMs} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
