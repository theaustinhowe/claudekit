import fs from "node:fs";
import path from "node:path";
import { getDb } from "@/lib/db";
import { execute, queryOne } from "@/lib/db/helpers";
import type { ProjectTemplate } from "@/lib/types";
import { generateId, nowTimestamp } from "@/lib/utils";

interface GenerateOptions {
  templateId: string;
  policyId?: string;
  intent: string;
  projectName: string;
  projectPath: string;
  packageManager: string;
  features: string[];
  gitInit: boolean;
  onProgress?: (message: string) => void;
}

interface TemplateFile {
  path: string;
  content: string;
}

function getPackageJson(
  projectName: string,
  _packageManager: string,
  templateType: string,
  features: string[],
): string {
  if (templateType === "monorepo") {
    return JSON.stringify(
      {
        name: projectName,
        private: true,
        scripts: {
          dev: "pnpm -r --parallel dev",
          build: "pnpm -r build",
          lint: "pnpm -r lint",
          format: "biome format --write .",
        },
        devDependencies: {
          "@biomejs/biome": "^2.0.0",
        },
      },
      null,
      2,
    );
  }

  const base: {
    name: string;
    version: string;
    private: boolean;
    scripts: Record<string, string>;
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  } = {
    name: projectName,
    version: "0.1.0",
    private: true,
    scripts: {
      dev: templateType === "nextjs" ? "next dev" : "tsx watch src/index.ts",
      build: templateType === "nextjs" ? "next build" : "tsc",
      start: templateType === "nextjs" ? "next start" : "node dist/index.js",
      lint: "biome check .",
      test: 'echo "TODO: add test runner" && exit 0',
      format: "biome format --write .",
    },
    dependencies: {},
    devDependencies: {
      typescript: "^5.7.0",
      "@biomejs/biome": "^2.0.0",
    },
  };

  if (templateType === "nextjs") {
    base.dependencies = {
      next: "^15.1.0",
      react: "^19.0.0",
      "react-dom": "^19.0.0",
    };
    base.devDependencies = {
      ...base.devDependencies,
      "@types/node": "^22.0.0",
      "@types/react": "^19.0.0",
      "@types/react-dom": "^19.0.0",
    };
  } else if (templateType === "node") {
    base.devDependencies = {
      ...base.devDependencies,
      "@types/node": "^22.0.0",
      tsx: "^4.0.0",
    };
  }

  if (features.includes("tailwind")) {
    base.devDependencies.tailwindcss = "^4.0.0";
  }

  if (features.includes("supabase")) {
    base.dependencies["@supabase/supabase-js"] = "^2.47.0";
  }

  return JSON.stringify(base, null, 2);
}

function getTsConfig(templateType: string): string {
  if (templateType === "monorepo") {
    return JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          strict: true,
          esModuleInterop: true,
          module: "esnext",
          moduleResolution: "bundler",
          resolveJsonModule: true,
          isolatedModules: true,
          skipLibCheck: true,
        },
      },
      null,
      2,
    );
  }

  const base: {
    compilerOptions: Record<string, unknown>;
    include: string[];
    exclude: string[];
  } = {
    compilerOptions: {
      target: "ES2022",
      lib: templateType === "nextjs" ? ["dom", "dom.iterable", "esnext"] : ["esnext"],
      allowJs: true,
      skipLibCheck: true,
      strict: true,
      noEmit: templateType === "nextjs",
      esModuleInterop: true,
      module: "esnext",
      moduleResolution: "bundler",
      resolveJsonModule: true,
      isolatedModules: true,
      jsx: templateType === "nextjs" ? "preserve" : undefined,
      incremental: true,
      paths: { "@/*": ["./src/*"] },
      outDir: templateType !== "nextjs" ? "./dist" : undefined,
    },
    include:
      templateType === "nextjs" ? ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"] : ["src/**/*.ts"],
    exclude: ["node_modules"],
  };

  return JSON.stringify(base, null, 2);
}

function generateFiles(
  projectName: string,
  templateType: string,
  packageManager: string,
  features: string[],
): TemplateFile[] {
  const files: TemplateFile[] = [];

  files.push({
    path: "package.json",
    content: getPackageJson(projectName, packageManager, templateType, features),
  });

  files.push({
    path: "tsconfig.json",
    content: getTsConfig(templateType),
  });

  files.push({
    path: ".gitignore",
    content: `node_modules/\ndist/\n.next/\n.env.local\n.env*.local\n*.tsbuildinfo\n.DS_Store\n`,
  });

  files.push({
    path: "README.md",
    content: `# ${projectName}\n\n## Getting Started\n\n\`\`\`bash\n${packageManager} install\n${packageManager} dev\n\`\`\`\n`,
  });

  files.push({
    path: "CLAUDE.md",
    content:
      templateType === "monorepo"
        ? `# ${projectName}\n\n## Overview\n\nTODO: Describe the project purpose.\n\n## Structure\n\nMonorepo managed with pnpm workspaces.\n\n- \`apps/web\` — Next.js web application\n- \`packages/shared\` — Shared utilities and types\n\n## Tech Stack\n\n- TypeScript\n- pnpm workspaces\n- Next.js 15 (App Router) in apps/web\n\n## Development\n\n\`\`\`bash\n${packageManager} install\n${packageManager} dev\n\`\`\`\n`
        : `# ${projectName}\n\n## Overview\n\nTODO: Describe the project purpose.\n\n## Tech Stack\n\n- TypeScript\n${templateType === "nextjs" ? "- Next.js 15 (App Router)\n" : ""}\n## Development\n\n\`\`\`bash\n${packageManager} install\n${packageManager} dev\n\`\`\`\n`,
  });

  if (templateType === "nextjs") {
    files.push({
      path: "src/app/layout.tsx",
      content: `import type { Metadata } from "next";\n\nexport const metadata: Metadata = {\n  title: "${projectName}",\n  description: "Generated by Gadget",\n};\n\nexport default function RootLayout({\n  children,\n}: {\n  children: React.ReactNode;\n}) {\n  return (\n    <html lang="en">\n      <body>{children}</body>\n    </html>\n  );\n}\n`,
    });

    files.push({
      path: "src/app/page.tsx",
      content: `export default function Home() {\n  return (\n    <main>\n      <h1>${projectName}</h1>\n      <p>Edit src/app/page.tsx to get started.</p>\n    </main>\n  );\n}\n`,
    });

    files.push({
      path: "next.config.ts",
      content: `import type { NextConfig } from "next";\n\nconst nextConfig: NextConfig = {};\n\nexport default nextConfig;\n`,
    });
  } else if (templateType === "node") {
    files.push({
      path: "src/index.ts",
      content: `import { createServer } from "node:http";\n\nconst PORT = Number(process.env.PORT) || 3000;\n\nconst server = createServer((req, res) => {\n  res.writeHead(200, { "Content-Type": "application/json" });\n  res.end(JSON.stringify({ status: "ok", name: "${projectName}" }));\n});\n\nserver.listen(PORT, () => {\n  console.log(\`${projectName} listening on http://localhost:\${PORT}\`);\n});\n`,
    });
  } else if (templateType === "library") {
    files.push({
      path: "src/index.ts",
      content: `export function hello(name: string): string {\n  return \`Hello, \${name}!\`;\n}\n`,
    });
  } else if (templateType === "monorepo") {
    // Workspace config
    files.push({
      path: "pnpm-workspace.yaml",
      content: `packages:\n  - "apps/*"\n  - "packages/*"\n`,
    });

    // apps/web — a minimal Next.js app
    files.push({
      path: "apps/web/package.json",
      content: JSON.stringify(
        {
          name: `@${projectName}/web`,
          version: "0.1.0",
          private: true,
          scripts: { dev: "next dev --port 3000", build: "next build", start: "next start", lint: "biome check ." },
          dependencies: {
            next: "^15.1.0",
            react: "^19.0.0",
            "react-dom": "^19.0.0",
            [`@${projectName}/shared`]: "workspace:*",
          },
          devDependencies: {
            typescript: "^5.7.0",
            "@types/node": "^22.0.0",
            "@types/react": "^19.0.0",
            "@types/react-dom": "^19.0.0",
          },
        },
        null,
        2,
      ),
    });

    files.push({
      path: "apps/web/next.config.ts",
      content: `import type { NextConfig } from "next";\n\nconst nextConfig: NextConfig = {\n  transpilePackages: ["@${projectName}/shared"],\n};\n\nexport default nextConfig;\n`,
    });

    files.push({
      path: "apps/web/tsconfig.json",
      content: JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022",
            lib: ["dom", "dom.iterable", "esnext"],
            allowJs: true,
            skipLibCheck: true,
            strict: true,
            noEmit: true,
            esModuleInterop: true,
            module: "esnext",
            moduleResolution: "bundler",
            resolveJsonModule: true,
            isolatedModules: true,
            jsx: "preserve",
            incremental: true,
            paths: { "@/*": ["./src/*"] },
          },
          include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
          exclude: ["node_modules"],
        },
        null,
        2,
      ),
    });

    files.push({
      path: "apps/web/src/app/layout.tsx",
      content: `import type { Metadata } from "next";\n\nexport const metadata: Metadata = {\n  title: "${projectName}",\n  description: "Generated by Gadget",\n};\n\nexport default function RootLayout({\n  children,\n}: {\n  children: React.ReactNode;\n}) {\n  return (\n    <html lang="en">\n      <body>{children}</body>\n    </html>\n  );\n}\n`,
    });

    files.push({
      path: "apps/web/src/app/page.tsx",
      content: `import { greet } from "@${projectName}/shared";\n\nexport default function Home() {\n  return (\n    <main>\n      <h1>{greet("${projectName}")}</h1>\n      <p>Edit apps/web/src/app/page.tsx to get started.</p>\n    </main>\n  );\n}\n`,
    });

    // packages/shared — a shared library
    files.push({
      path: "packages/shared/package.json",
      content: JSON.stringify(
        {
          name: `@${projectName}/shared`,
          version: "0.1.0",
          private: true,
          main: "./src/index.ts",
          types: "./src/index.ts",
          scripts: { build: "tsc", lint: "biome check ." },
          devDependencies: { typescript: "^5.7.0" },
        },
        null,
        2,
      ),
    });

    files.push({
      path: "packages/shared/tsconfig.json",
      content: JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022",
            lib: ["esnext"],
            strict: true,
            esModuleInterop: true,
            module: "esnext",
            moduleResolution: "bundler",
            resolveJsonModule: true,
            isolatedModules: true,
            declaration: true,
            outDir: "./dist",
          },
          include: ["src/**/*.ts"],
          exclude: ["node_modules"],
        },
        null,
        2,
      ),
    });

    files.push({
      path: "packages/shared/src/index.ts",
      content: `export function greet(name: string): string {\n  return \`Hello from \${name}!\`;\n}\n`,
    });
  }

  if (features.includes("supabase")) {
    files.push({
      path: ".env.local.example",
      content: `NEXT_PUBLIC_SUPABASE_URL=your-supabase-url\nNEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key\nSUPABASE_SERVICE_ROLE_KEY=your-service-role-key\n`,
    });

    files.push({
      path: "src/lib/supabase.ts",
      content: `import { createClient } from "@supabase/supabase-js";\n\nconst supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;\nconst supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;\n\nexport const supabase = createClient(supabaseUrl, supabaseAnonKey);\n`,
    });
  }

  files.push({
    path: "biome.json",
    content: JSON.stringify(
      {
        $schema: "https://biomejs.dev/schemas/2.0.0/schema.json",
        formatter: { indentStyle: "space", indentWidth: 2, lineWidth: 120 },
        linter: { enabled: true, rules: { recommended: true } },
        javascript: { formatter: { quoteStyle: "double", semicolons: "always", trailingCommas: "all" } },
      },
      null,
      2,
    ),
  });

  return files;
}

function generateHandoffBrief(
  projectName: string,
  projectPath: string,
  templateType: string,
  packageManager: string,
  features: string[],
  files: TemplateFile[],
): string {
  return `# Handoff Brief: ${projectName}

## Quick Start

\`\`\`bash
cd ${projectPath}
${packageManager} install
${packageManager} dev
\`\`\`

## What Was Generated

- **Template:** ${templateType}
- **Package Manager:** ${packageManager}
- **Features:** ${features.length > 0 ? features.join(", ") : "none"}
- **Files Created:** ${files.length}

### File List
${files.map((f) => `- \`${f.path}\``).join("\n")}

## Next Steps

1. Install dependencies: \`${packageManager} install\`
2. Start development: \`${packageManager} dev\`
3. Update README.md with project-specific details
4. Update CLAUDE.md with architecture decisions
${features.includes("supabase") ? "5. Copy .env.local.example to .env.local and fill in Supabase credentials\n" : ""}
## Policy Compliance

This project was generated following the configured policy defaults.
`;
}

export async function generateProject(options: GenerateOptions) {
  const { templateId, policyId, intent, projectName, projectPath, packageManager, features, gitInit, onProgress } =
    options;

  const db = await getDb();

  // Get template
  const template = await queryOne<ProjectTemplate>(db, "SELECT * FROM templates WHERE id = ?", [templateId]);

  if (!template) {
    return { success: false, error: "Template not found" };
  }

  // Create generator run record
  const runId = generateId();
  await execute(
    db,
    `
    INSERT INTO generator_runs (id, template_id, policy_id, intent, project_name, project_path, package_manager, features, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'running')
  `,
    [runId, templateId, policyId || null, intent, projectName, projectPath, packageManager, JSON.stringify(features)],
  );

  onProgress?.(`[INFO] Generating project: ${projectName}`);
  onProgress?.(`[INFO] Template: ${template.name}`);
  onProgress?.(`[INFO] Path: ${projectPath}`);

  // Generate files
  const files = generateFiles(projectName, template.type ?? "library", packageManager, features);
  onProgress?.(`[INFO] Generated ${files.length} files`);

  // Create project directory (projectPath is the parent, projectName is the folder)
  const expandedPath = path.join(projectPath.replace("~", process.env.HOME || ""), projectName);

  try {
    if (!fs.existsSync(expandedPath)) {
      fs.mkdirSync(expandedPath, { recursive: true });
    }

    // Write files
    for (const file of files) {
      const filePath = path.join(expandedPath, file.path);
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(filePath, file.content, "utf-8");
      onProgress?.(`[INFO] Created: ${file.path}`);
    }

    // Git init
    if (gitInit) {
      onProgress?.("[INFO] Initializing git repository...");
      try {
        const { execSync } = require("node:child_process");
        execSync("git init", { cwd: expandedPath, stdio: "ignore" });
        execSync("git add .", { cwd: expandedPath, stdio: "ignore" });
        execSync('git commit -m "Initial commit from Gadget Generator"', {
          cwd: expandedPath,
          stdio: "ignore",
        });
        onProgress?.("[SUCCESS] Git repository initialized with initial commit");
      } catch {
        onProgress?.("[WARN] Git init failed — git may not be available");
      }
    }

    // Generate handoff brief
    const displayPath = projectPath.endsWith("/") ? `${projectPath}${projectName}` : `${projectPath}/${projectName}`;
    const handoffBrief = generateHandoffBrief(
      projectName,
      displayPath,
      template.type ?? "library",
      packageManager,
      features,
      files,
    );

    // Update run record
    await execute(
      db,
      `
      UPDATE generator_runs
      SET status = 'done', handoff_brief = ?, completed_at = ?
      WHERE id = ?
    `,
      [handoffBrief, nowTimestamp(), runId],
    );

    onProgress?.("[SUCCESS] Project generated successfully!");

    return {
      success: true,
      runId,
      projectPath: expandedPath,
      filesCreated: files.length,
      handoffBrief,
    };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await execute(db, "UPDATE generator_runs SET status = 'error' WHERE id = ?", [runId]);
    onProgress?.(`[ERROR] ${errMsg}`);
    return { success: false, error: errMsg };
  }
}
