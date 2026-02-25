import { checkpoint, execute } from "@claudekit/duckdb";
import type { DuckDBConnection } from "@duckdb/node-api";
import { nowTimestamp } from "@/lib/utils";

export async function seedDatabase(conn: DuckDBConnection): Promise<void> {
  await execute(conn, "BEGIN TRANSACTION");

  try {
    // Seed templates
    const templates = [
      {
        id: "template-1",
        name: "Next.js Web App",
        type: "nextjs",
        description: "Full-featured Next.js 16 app with App Router, TypeScript, and Tailwind",
        pm: "pnpm",
        includes: ["TypeScript", "Tailwind CSS", "Biome", "App Router"],
        baseFiles: { "package.json": "", "tsconfig.json": "", "tailwind.config.ts": "", "next.config.mjs": "" },
      },
      {
        id: "template-2",
        name: "Node.js Service",
        type: "node",
        description: "Backend service with TypeScript, Express, and testing setup",
        pm: "npm",
        includes: ["TypeScript", "Express", "Jest", "Biome"],
        baseFiles: { "package.json": "", "tsconfig.json": "", "jest.config.js": "", "src/index.ts": "" },
      },
      {
        id: "template-3",
        name: "Monorepo Starter",
        type: "monorepo",
        description: "pnpm workspaces with shared configs",
        pm: "pnpm",
        includes: ["pnpm Workspaces", "Shared Biome", "Shared TypeScript"],
        baseFiles: { "package.json": "", "pnpm-workspace.yaml": "", "apps/": "", "packages/": "" },
      },
    ];

    for (const t of templates) {
      await execute(
        conn,
        `INSERT INTO templates (id, name, type, description, recommended_pm, includes, base_files, is_builtin)
         VALUES (?, ?, ?, ?, ?, ?, ?, true)
         ON CONFLICT DO NOTHING`,
        [t.id, t.name, t.type, t.description, t.pm, JSON.stringify(t.includes), JSON.stringify(t.baseFiles)],
      );
    }

    // Seed settings
    const settings = [
      ["theme", "system"],
      ["default_project_path", process.env.NEXT_PUBLIC_DEFAULT_DIRECTORY || "~/Projects"],
    ];

    for (const [key, value] of settings) {
      await execute(conn, "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT DO NOTHING", [key, value]);
    }

    // Mark as seeded so we don't re-seed
    await execute(
      conn,
      `INSERT INTO settings (key, value) VALUES ('seeded_at', ?)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
      [nowTimestamp()],
    );

    await execute(conn, "COMMIT");
    await checkpoint(conn);
  } catch (err) {
    await execute(conn, "ROLLBACK");
    throw err;
  }
}

// CLI entry point for `pnpm seed`
if (typeof require !== "undefined" && require.main === module) {
  (async () => {
    const { getDb } = await import("./index");
    const conn = await getDb();
    await seedDatabase(conn);
    console.log("Seed complete.");
    process.exit(0);
  })();
}
