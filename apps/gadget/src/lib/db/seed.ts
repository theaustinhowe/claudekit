import { checkpoint, execute } from "@claudekit/duckdb";
import type { DuckDBConnection } from "@duckdb/node-api";
import {
  CLAUDE_CONFIG_SOURCE_ID,
  CURATED_SOURCE_ID,
  GITHUB_SOURCE_CLAUDE_CODE,
  GITHUB_SOURCE_MCP_SERVERS,
  GITHUB_SOURCE_VERCEL_AI,
  LIBRARY_REPO_ID,
} from "@/lib/constants";
import { discoverClaudeConfigConcepts } from "@/lib/services/claude-config-scanner";
import { getCuratedMcpServers, mcpListEntriesToConcepts } from "@/lib/services/mcp-list-scanner";
import { generateId, nowTimestamp } from "@/lib/utils";

export async function seedDatabase(conn: DuckDBConnection): Promise<void> {
  await execute(conn, "BEGIN TRANSACTION");

  try {
    // Seed policies
    const policies = [
      {
        id: "policy-1",
        name: "Next.js App Standard",
        description: "Standard policy for Next.js applications with modern tooling",
        expectedVersions: {
          node: ">=22.0.0",
          react: "^19.2.0",
          next: "^16.1.0",
          typescript: "^5.9.0",
          "@biomejs/biome": "^2.3.0",
        },
        bannedDeps: [
          { name: "moment", replacement: "date-fns", reason: "Large bundle size, use date-fns instead" },
          { name: "lodash", replacement: "lodash-es", reason: "Use ES modules version for tree-shaking" },
          {
            name: "axios",
            replacement: "native fetch",
            reason: "Use native fetch API (available in all modern runtimes)",
          },
        ],
        allowedPMs: ["pnpm", "bun"],
        preferredPM: "pnpm",
        ignorePatterns: ["node_modules", "dist", ".next", ".vercel"],
        genDefaults: { template: "nextjs-web", features: ["typescript", "tailwind", "biome"] },
        repoTypes: ["nextjs"],
      },
      {
        id: "policy-2",
        name: "Node.js Service",
        description: "Policy for backend Node.js services",
        expectedVersions: { node: ">=22.0.0", typescript: "^5.9.0", "@biomejs/biome": "^2.3.0" },
        bannedDeps: [
          {
            name: "request",
            replacement: "native fetch",
            reason: "Deprecated since 2020. Use native fetch (Node 18+)",
          },
          { name: "axios", replacement: "native fetch", reason: "Use native fetch API" },
        ],
        allowedPMs: ["npm", "pnpm", "bun"],
        preferredPM: "npm",
        ignorePatterns: ["node_modules", "dist", "build"],
        genDefaults: { template: "node-service", features: ["typescript", "biome", "jest"] },
        repoTypes: ["node"],
      },
      {
        id: "policy-3",
        name: "Library Standard",
        description: "Policy for reusable JavaScript/TypeScript libraries",
        expectedVersions: { node: ">=20.0.0", typescript: "^5.9.0", "@biomejs/biome": "^2.3.0" },
        bannedDeps: [],
        allowedPMs: ["pnpm", "npm"],
        preferredPM: "pnpm",
        ignorePatterns: ["node_modules", "dist", "lib"],
        genDefaults: { template: "library", features: ["typescript", "vitest", "biome"] },
        repoTypes: ["library", "react"],
      },
      {
        id: "policy-4",
        name: "Monorepo Standard",
        description: "Policy for pnpm workspace monorepos",
        expectedVersions: { node: ">=22.0.0", typescript: "^5.9.0", "@biomejs/biome": "^2.3.0" },
        bannedDeps: [{ name: "moment", replacement: "date-fns", reason: "Large bundle size" }],
        allowedPMs: ["pnpm"],
        preferredPM: "pnpm",
        ignorePatterns: ["node_modules", "dist"],
        genDefaults: { template: "monorepo", features: ["typescript", "biome"] },
        repoTypes: ["monorepo"],
      },
      {
        id: "policy-5",
        name: "Tanstack Standard",
        description: "Policy for projects using the Tanstack ecosystem (Query, Table, Router, Form)",
        expectedVersions: {
          node: ">=20.0.0",
          react: "^19.2.0",
          typescript: "^5.9.0",
          "@biomejs/biome": "^2.3.0",
          "@tanstack/react-query": "^5.0.0",
          "@tanstack/react-table": "^8.0.0",
          "@tanstack/react-router": "^1.0.0",
          "@tanstack/react-form": "^1.28.0",
        },
        bannedDeps: [
          { name: "react-query", replacement: "@tanstack/react-query", reason: "Use @tanstack/react-query (v5+)" },
          { name: "react-table", replacement: "@tanstack/react-table", reason: "Use @tanstack/react-table (v8+)" },
        ],
        allowedPMs: ["pnpm", "npm", "bun"],
        preferredPM: "pnpm",
        ignorePatterns: ["node_modules", "dist", ".next", "build"],
        genDefaults: { template: "nextjs-web", features: ["typescript", "tanstack-query", "biome"] },
        repoTypes: ["tanstack"],
      },
    ];

    for (const p of policies) {
      await execute(
        conn,
        `INSERT INTO policies (id, name, description, expected_versions, banned_dependencies, allowed_package_managers, preferred_package_manager, ignore_patterns, generator_defaults, repo_types, is_builtin)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, true)
         ON CONFLICT DO NOTHING`,
        [
          p.id,
          p.name,
          p.description,
          JSON.stringify(p.expectedVersions),
          JSON.stringify(p.bannedDeps),
          JSON.stringify(p.allowedPMs),
          p.preferredPM,
          JSON.stringify(p.ignorePatterns),
          JSON.stringify(p.genDefaults),
          JSON.stringify(p.repoTypes),
        ],
      );
    }

    // Seed settings (no demo_mode)
    const settings = [["theme", "system"]];

    for (const [key, value] of settings) {
      await execute(conn, "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT DO NOTHING", [key, value]);
    }

    // Seed __library__ sentinel repo
    await execute(
      conn,
      `INSERT INTO repos (id, name, local_path, source)
       VALUES (?, 'Concept Library', '__library__', 'library')
       ON CONFLICT DO NOTHING`,
      [LIBRARY_REPO_ID],
    );

    // Seed curated MCP server source + concepts
    await execute(
      conn,
      `INSERT INTO concept_sources (id, source_type, name, description, is_builtin)
       VALUES (?, 'curated', 'Popular MCP Servers', 'Curated collection of popular MCP servers', true)
       ON CONFLICT DO NOTHING`,
      [CURATED_SOURCE_ID],
    );

    const curatedServers = getCuratedMcpServers();
    const curatedConcepts = mcpListEntriesToConcepts(curatedServers);
    for (const concept of curatedConcepts) {
      await execute(
        conn,
        `INSERT INTO concepts (id, repo_id, source_id, concept_type, name, description, relative_path, content, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT DO NOTHING`,
        [
          generateId(),
          LIBRARY_REPO_ID,
          CURATED_SOURCE_ID,
          concept.concept_type,
          concept.name,
          concept.description,
          concept.relative_path,
          concept.content,
          JSON.stringify(concept.metadata),
        ],
      );
    }

    // Seed Claude Config source + concepts
    await execute(
      conn,
      `INSERT INTO concept_sources (id, source_type, name, description, is_builtin)
       VALUES (?, 'claude_config', 'My Claude Config', 'Concepts from your global ~/.claude directory', true)
       ON CONFLICT DO NOTHING`,
      [CLAUDE_CONFIG_SOURCE_ID],
    );

    const claudeConfigConcepts = discoverClaudeConfigConcepts();
    for (const concept of claudeConfigConcepts) {
      await execute(
        conn,
        `INSERT INTO concepts (id, repo_id, source_id, concept_type, name, description, relative_path, content, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT DO NOTHING`,
        [
          generateId(),
          LIBRARY_REPO_ID,
          CLAUDE_CONFIG_SOURCE_ID,
          concept.concept_type,
          concept.name,
          concept.description,
          concept.relative_path,
          concept.content,
          JSON.stringify(concept.metadata),
        ],
      );
    }

    // Seed builtin GitHub repo sources (only repos with discoverable concept files)
    const githubSources = [
      {
        id: GITHUB_SOURCE_MCP_SERVERS,
        name: "MCP Reference Servers",
        description: "Official MCP server reference implementations",
        owner: "modelcontextprotocol",
        repo: "servers",
      },
      {
        id: GITHUB_SOURCE_CLAUDE_CODE,
        name: "Claude Code",
        description: "Official Claude Code CLI with commands and plugin config",
        owner: "anthropics",
        repo: "claude-code",
      },
      {
        id: GITHUB_SOURCE_VERCEL_AI,
        name: "Vercel AI SDK",
        description: "AI SDK with skills for tool calling, agents, and streaming",
        owner: "vercel",
        repo: "ai",
      },
    ];

    for (const s of githubSources) {
      await execute(
        conn,
        `INSERT INTO concept_sources (id, source_type, name, description, github_owner, github_repo, github_url, github_default_branch, is_builtin)
         VALUES (?, 'github_repo', ?, ?, ?, ?, ?, 'main', true)
         ON CONFLICT DO NOTHING`,
        [s.id, s.name, s.description, s.owner, s.repo, `https://github.com/${s.owner}/${s.repo}`],
      );
    }

    // Seed policy templates (DB-backed, replaces hardcoded presetTemplates)
    const policyTemplates = [
      {
        id: "pt-nextjs",
        name: "Next.js App",
        description: "Modern Next.js with App Router",
        icon: "globe",
        category: "frontend",
        defaults: {
          name: "Next.js App Standard",
          description: "Standard policy for Next.js applications with modern tooling",
          expected_versions: {
            node: ">=22.0.0",
            react: "^19.2.0",
            next: "^16.1.0",
            typescript: "^5.9.0",
            "@biomejs/biome": "^2.3.0",
          },
          banned_dependencies: [
            { name: "moment", replacement: "date-fns", reason: "Large bundle size, use date-fns instead" },
            { name: "lodash", replacement: "lodash-es", reason: "Use ES modules version for tree-shaking" },
            {
              name: "axios",
              replacement: "native fetch",
              reason: "Use native fetch API (available in all modern runtimes)",
            },
          ],
          allowed_package_managers: ["pnpm", "bun"],
          preferred_package_manager: "pnpm",
        },
      },
      {
        id: "pt-node",
        name: "Node Service",
        description: "Backend Node.js service",
        icon: "server",
        category: "backend",
        defaults: {
          name: "Node.js Service",
          description: "Policy for backend Node.js services",
          expected_versions: { node: ">=22.0.0", typescript: "^5.9.0", "@biomejs/biome": "^2.3.0" },
          banned_dependencies: [
            {
              name: "request",
              replacement: "native fetch",
              reason: "Deprecated since 2020. Use native fetch (Node 18+)",
            },
            { name: "axios", replacement: "native fetch", reason: "Use native fetch API" },
          ],
          allowed_package_managers: ["npm", "pnpm", "bun"],
          preferred_package_manager: "npm",
        },
      },
      {
        id: "pt-library",
        name: "Library",
        description: "Reusable TypeScript library",
        icon: "book",
        category: "library",
        defaults: {
          name: "Library Standard",
          description: "Policy for reusable JavaScript/TypeScript libraries",
          expected_versions: { node: ">=20.0.0", typescript: "^5.9.0", "@biomejs/biome": "^2.3.0" },
          banned_dependencies: [],
          allowed_package_managers: ["pnpm", "npm"],
          preferred_package_manager: "pnpm",
        },
      },
      {
        id: "pt-monorepo",
        name: "Monorepo",
        description: "pnpm workspace monorepo",
        icon: "layers",
        category: "monorepo",
        defaults: {
          name: "Monorepo Standard",
          description: "Policy for pnpm workspace monorepos",
          expected_versions: { node: ">=22.0.0", typescript: "^5.9.0", "@biomejs/biome": "^2.3.0" },
          banned_dependencies: [{ name: "moment", replacement: "date-fns", reason: "Large bundle size" }],
          allowed_package_managers: ["pnpm"],
          preferred_package_manager: "pnpm",
        },
      },
    ];

    for (const pt of policyTemplates) {
      await execute(
        conn,
        `INSERT INTO policy_templates (id, name, description, icon, defaults, category, is_builtin)
         VALUES (?, ?, ?, ?, ?, ?, true)
         ON CONFLICT DO NOTHING`,
        [pt.id, pt.name, pt.description, pt.icon, JSON.stringify(pt.defaults), pt.category],
      );
    }

    // Seed builtin custom rules
    const customRules = [
      {
        id: "rule-license",
        name: "Require LICENSE file",
        description: "Ensure a LICENSE file exists in the repository root",
        category: "structure",
        severity: "warning",
        rule_type: "file_exists",
        config: { paths: ["LICENSE", "LICENSE.md", "LICENSE.txt"] },
        suggested_actions: ["Add a LICENSE file to the repository root", "Choose an appropriate open source license"],
      },
      {
        id: "rule-nvmrc",
        name: "Require .nvmrc",
        description: "Ensure a .nvmrc file exists to pin the Node.js version",
        category: "config",
        severity: "info",
        rule_type: "file_exists",
        config: { paths: [".nvmrc", ".node-version"] },
        suggested_actions: ["Create a .nvmrc file with the required Node.js version"],
      },
      {
        id: "rule-tsconfig-strict",
        name: "Ensure tsconfig strict mode",
        description: "TypeScript strict mode should be enabled for type safety",
        category: "config",
        severity: "warning",
        rule_type: "json_field",
        config: { file: "tsconfig.json", field: "compilerOptions.strict", expected: true },
        suggested_actions: ['Set "strict": true in tsconfig.json compilerOptions'],
      },
      {
        id: "rule-gitignore",
        name: "Require .gitignore",
        description: "Ensure a .gitignore file exists to prevent committing unwanted files",
        category: "structure",
        severity: "warning",
        rule_type: "file_exists",
        config: { paths: [".gitignore"] },
        suggested_actions: ["Add a .gitignore file appropriate for your project type"],
      },
      {
        id: "rule-tsconfig",
        name: "Require tsconfig.json",
        description: "Ensure a TypeScript configuration file exists in the project",
        category: "config",
        severity: "warning",
        rule_type: "file_exists",
        config: { paths: ["tsconfig.json", "tsconfig.base.json"] },
        suggested_actions: ["Run npx tsc --init to create a tsconfig.json", "Add TypeScript as a devDependency"],
      },
      {
        id: "rule-biome",
        name: "Require biome.json",
        description: "Ensure a Biome configuration file exists for linting and formatting",
        category: "config",
        severity: "warning",
        rule_type: "file_exists",
        config: { paths: ["biome.json", "biome.jsonc"] },
        suggested_actions: [
          "Run npx @biomejs/biome init to create a biome.json",
          "Add @biomejs/biome as a devDependency",
        ],
      },
      {
        id: "rule-packagejson-type",
        name: "Require ESM type field",
        description: 'Ensure package.json has "type": "module" for native ESM support',
        category: "config",
        severity: "info",
        rule_type: "json_field",
        config: { file: "package.json", field: "type", expected: "module" },
        suggested_actions: ['Set "type": "module" in package.json for native ESM support'],
      },
    ];

    for (const rule of customRules) {
      await execute(
        conn,
        `INSERT INTO custom_rules (id, name, description, category, severity, rule_type, config, suggested_actions, is_builtin, is_enabled)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, true, true)
         ON CONFLICT DO NOTHING`,
        [
          rule.id,
          rule.name,
          rule.description,
          rule.category,
          rule.severity,
          rule.rule_type,
          JSON.stringify(rule.config),
          JSON.stringify(rule.suggested_actions),
        ],
      );
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
