import type { Metadata } from "next";
import type { ServerKeyGroup } from "@/components/settings/api-keys-tab";
import { SettingsClient } from "@/components/settings/settings-client";
import { readEnvLocal } from "@/lib/actions/env-keys";
import { getScanRoots } from "@/lib/actions/scans";
import { getCleanupFiles } from "@/lib/actions/settings";
import { getCuratedMcpServers } from "@/lib/services/mcp-list-scanner";

export const metadata: Metadata = { title: "Settings" };

interface SettingsPageProps {
  searchParams: Promise<{ tab?: string }>;
}

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const { tab } = await searchParams;

  const [scanRoots, envKeys, cleanupFiles] = await Promise.all([getScanRoots(), readEnvLocal(), getCleanupFiles()]);

  const servers = getCuratedMcpServers();
  const serverKeys: ServerKeyGroup[] = [
    ...servers
      .filter((s) => s.env && Object.keys(s.env).length > 0)
      .map((s) => ({
        name: s.name,
        description: s.description || `MCP Server: ${s.name}`,
        keys: Object.keys(s.env ?? {}),
        tags: s.tags || [],
      })),
  ];

  return (
    <SettingsClient
      scanRoots={scanRoots}
      envKeys={envKeys}
      serverKeys={serverKeys}
      cleanupFiles={cleanupFiles}
      initialTab={tab}
    />
  );
}
