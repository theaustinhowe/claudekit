import type { Metadata } from "next";
import { ToolboxClient } from "@/components/toolbox/toolbox-client";
import { getToolboxToolIds } from "@/lib/actions/toolbox";

export const metadata: Metadata = { title: "Toolbox" };

export default async function ToolboxPage() {
  const toolIds = await getToolboxToolIds();

  return <ToolboxClient initialToolIds={toolIds} />;
}
