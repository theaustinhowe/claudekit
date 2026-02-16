import fs from "node:fs";
import path from "node:path";
import type { GeneratorProject, MockEntity, UiSpec } from "@/lib/types";
import { expandTilde } from "@/lib/utils";

interface ExportFile {
  path: string;
  content: string;
}

/**
 * Generate all project files deterministically from a locked spec.
 */
export function generateExportFiles(project: GeneratorProject, spec: UiSpec, mockData: MockEntity[]): ExportFile[] {
  const files: ExportFile[] = [];
  const isNextjs = project.platform === "nextjs";
  const hasBiome = project.constraints.includes("biome");
  const hasTailwind = project.constraints.includes("tailwind");
  const hasShadcn = project.constraints.includes("shadcn");
  const hasVitest = project.constraints.includes("vitest");
  const pm = project.package_manager;

  // package.json
  const deps: Record<string, string> = {};
  const devDeps: Record<string, string> = { typescript: "^5.7.0" };

  if (isNextjs) {
    deps.next = "^15.1.0";
    deps.react = "^19.0.0";
    deps["react-dom"] = "^19.0.0";
    devDeps["@types/node"] = "^22.0.0";
    devDeps["@types/react"] = "^19.0.0";
    devDeps["@types/react-dom"] = "^19.0.0";
  }
  if (hasTailwind) devDeps.tailwindcss = "^4.0.0";
  if (hasBiome) devDeps["@biomejs/biome"] = "^2.0.0";
  if (hasVitest) devDeps.vitest = "^3.0.0";
  if (hasShadcn) {
    deps["class-variance-authority"] = "^0.7.1";
    deps.clsx = "^2.1.1";
    deps["tailwind-merge"] = "^3.0.0";
    deps["lucide-react"] = "^0.460.0";
  }

  // Add service deps
  for (const svc of project.services) {
    if (svc.includes("supabase")) deps["@supabase/supabase-js"] = "^2.47.0";
    if (svc === "stripe") deps.stripe = "^17.0.0";
    if (svc === "resend") deps.resend = "^4.0.0";
    if (svc === "prisma") {
      deps["@prisma/client"] = "^6.0.0";
      devDeps.prisma = "^6.0.0";
    }
    if (svc === "drizzle") {
      deps["drizzle-orm"] = "^0.36.0";
      devDeps["drizzle-kit"] = "^0.28.0";
    }
  }

  files.push({
    path: "package.json",
    content: JSON.stringify(
      {
        name: project.project_name,
        version: "0.1.0",
        private: true,
        scripts: {
          dev: isNextjs ? "next dev" : "tsx watch src/index.ts",
          build: isNextjs ? "next build" : "tsc",
          start: isNextjs ? "next start" : "node dist/index.js",
          lint: hasBiome ? "biome check ." : "echo 'no linter'",
          format: hasBiome ? "biome format --write ." : "echo 'no formatter'",
          test: hasVitest ? "vitest" : "echo 'no tests yet'",
        },
        dependencies: deps,
        devDependencies: devDeps,
      },
      null,
      2,
    ),
  });

  // tsconfig.json
  files.push({
    path: "tsconfig.json",
    content: JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          lib: isNextjs ? ["dom", "dom.iterable", "esnext"] : ["esnext"],
          allowJs: true,
          skipLibCheck: true,
          strict: project.constraints.includes("typescript-strict"),
          noEmit: isNextjs,
          esModuleInterop: true,
          module: "esnext",
          moduleResolution: "bundler",
          resolveJsonModule: true,
          isolatedModules: true,
          jsx: isNextjs ? "preserve" : undefined,
          incremental: true,
          paths: { "@/*": ["./src/*"] },
        },
        include: isNextjs ? ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"] : ["src/**/*.ts"],
        exclude: ["node_modules"],
      },
      null,
      2,
    ),
  });

  // .gitignore
  files.push({
    path: ".gitignore",
    content: "node_modules/\ndist/\n.next/\n.env.local\n.env*.local\n*.tsbuildinfo\n.DS_Store\n",
  });

  // next.config.ts
  if (isNextjs) {
    files.push({
      path: "next.config.ts",
      content: `import type { NextConfig } from "next";\n\nconst nextConfig: NextConfig = {};\n\nexport default nextConfig;\n`,
    });
  }

  // biome.json
  if (hasBiome) {
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
  }

  // .env.local.example
  const envLines: string[] = [];
  for (const svc of project.services) {
    if (svc.includes("supabase")) {
      envLines.push("NEXT_PUBLIC_SUPABASE_URL=", "NEXT_PUBLIC_SUPABASE_ANON_KEY=", "SUPABASE_SERVICE_ROLE_KEY=");
    }
    if (svc === "stripe") envLines.push("STRIPE_SECRET_KEY=", "STRIPE_WEBHOOK_SECRET=");
    if (svc === "resend") envLines.push("RESEND_API_KEY=");
  }
  if (envLines.length > 0) {
    files.push({ path: ".env.local.example", content: `${envLines.join("\n")}\n` });
  }

  // ui-spec.json
  files.push({ path: "ui-spec.json", content: JSON.stringify(spec, null, 2) });

  // README.md
  const routeTable = spec.pages.map((p) => `| \`${p.route}\` | ${p.title} | ${p.description} |`).join("\n");
  files.push({
    path: "README.md",
    content: `# ${project.project_name}\n\n${project.idea_description}\n\n## Routes\n\n| Route | Title | Description |\n|-------|-------|-------------|\n${routeTable}\n\n## Getting Started\n\n\`\`\`bash\n${pm} install\n${pm} dev\n\`\`\`\n`,
  });

  // CLAUDE.md
  const compList = spec.components.map((c) => `- **${c.name}** (${c.component_type}) — ${c.description}`).join("\n");
  files.push({
    path: "CLAUDE.md",
    content: `# ${project.project_name}\n\n## Overview\n\n${project.idea_description}\n\n## Tech Stack\n\n- TypeScript${project.constraints.includes("typescript-strict") ? " (strict)" : ""}\n${isNextjs ? "- Next.js 15 (App Router)\n" : ""}${hasTailwind ? "- Tailwind CSS\n" : ""}${hasShadcn ? "- shadcn/ui\n" : ""}${hasBiome ? "- Biome\n" : ""}\n## Components\n\n${compList}\n\n## Development\n\n\`\`\`bash\n${pm} install\n${pm} dev\n\`\`\`\n`,
  });

  // tasks.md
  files.push({
    path: "tasks.md",
    content: generateTasksMd(project, spec, mockData),
  });

  // src/lib/types.ts from mock entities
  if (mockData.length > 0) {
    const typesDef = mockData
      .map((e) => {
        const fields = e.fields.map((f) => `  ${f.name}${f.nullable ? "?" : ""}: ${tsType(f.type)};`).join("\n");
        return `export interface ${e.name} {\n${fields}\n}`;
      })
      .join("\n\n");
    files.push({ path: "src/lib/types.ts", content: `${typesDef}\n` });
  }

  // src/lib/mock-data.ts
  if (mockData.length > 0) {
    const imports = mockData.map((e) => e.name).join(", ");
    const data = mockData
      .map((e) => {
        const rows = JSON.stringify(e.sample_rows, null, 2);
        return `export const ${camelCase(e.name)}Data: ${e.name}[] = ${rows};`;
      })
      .join("\n\n");
    files.push({
      path: "src/lib/mock-data.ts",
      content: `import type { ${imports} } from "./types";\n\n${data}\n`,
    });
  }

  // src/lib/utils.ts
  if (hasShadcn) {
    files.push({
      path: "src/lib/utils.ts",
      content: `import { type ClassValue, clsx } from "clsx";\nimport { twMerge } from "tailwind-merge";\n\nexport function cn(...inputs: ClassValue[]) {\n  return twMerge(clsx(inputs));\n}\n`,
    });
  }

  // App pages
  if (isNextjs) {
    // Root layout
    files.push({
      path: "src/app/layout.tsx",
      content: `import type { Metadata } from "next";\n${hasTailwind ? 'import "./globals.css";\n' : ""}\nexport const metadata: Metadata = {\n  title: "${project.project_name}",\n  description: "${project.idea_description.slice(0, 100)}",\n};\n\nexport default function RootLayout({ children }: { children: React.ReactNode }) {\n  return (\n    <html lang="en">\n      <body>{children}</body>\n    </html>\n  );\n}\n`,
    });

    if (hasTailwind) {
      files.push({ path: "src/app/globals.css", content: '@import "tailwindcss";\n' });
    }

    // Page files
    for (const page of spec.pages) {
      const routePath = page.route === "/" ? "" : page.route.replace(/^\//, "");
      const dir = routePath ? `src/app/${routePath}` : "src/app";
      const compImports = page.component_ids
        .map((cid) => {
          const comp = spec.components.find((c) => c.id === cid);
          return comp
            ? `import { ${comp.name} } from "@/components/${comp.component_type}/${kebabCase(comp.name)}";`
            : "";
        })
        .filter(Boolean)
        .join("\n");
      const compUsage = page.component_ids
        .map((cid) => {
          const comp = spec.components.find((c) => c.id === cid);
          return comp ? `      <${comp.name} />` : "";
        })
        .filter(Boolean)
        .join("\n");

      files.push({
        path: `${dir}/page.tsx`,
        content: `${compImports ? `${compImports}\n\n` : ""}export default function ${pascalCase(page.title)}Page() {\n  return (\n    <main>\n      <h1>${page.title}</h1>\n      <p>${page.description}</p>\n${compUsage}\n    </main>\n  );\n}\n`,
      });
    }
  }

  // Component stubs
  for (const comp of spec.components) {
    const propsType =
      comp.props.length > 0
        ? `interface ${comp.name}Props {\n${comp.props.map((p) => `  ${p.name}${p.required ? "" : "?"}: ${p.type};`).join("\n")}\n}`
        : "";
    const propsParam =
      comp.props.length > 0 ? `{ ${comp.props.map((p) => p.name).join(", ")} }: ${comp.name}Props` : "";
    const clientDirective = comp.is_client ? '"use client";\n\n' : "";

    files.push({
      path: `src/components/${comp.component_type}/${kebabCase(comp.name)}.tsx`,
      content: `${clientDirective}${propsType ? `${propsType}\n\n` : ""}export function ${comp.name}(${propsParam}) {\n  return (\n    <div>\n      <h2>${comp.name}</h2>\n      <p>${comp.description}</p>\n      {/* TODO: Implement ${comp.name} */}\n    </div>\n  );\n}\n`,
    });
  }

  return files;
}

function generateTasksMd(project: GeneratorProject, spec: UiSpec, mockData: MockEntity[]): string {
  const tasks: string[] = [];
  tasks.push(`# ${project.project_name} — Implementation Tasks\n`);
  tasks.push("## Phase 1: Foundation\n");
  tasks.push("- [ ] Install dependencies and verify dev server starts");
  tasks.push("- [ ] Set up environment variables from .env.local.example");
  if (project.constraints.includes("tailwind")) tasks.push("- [ ] Configure Tailwind CSS theme and globals");
  if (project.constraints.includes("shadcn")) tasks.push("- [ ] Install shadcn/ui components needed");
  tasks.push("");

  tasks.push("## Phase 2: Pages & Components\n");
  for (const page of spec.pages) {
    tasks.push(`- [ ] Implement ${page.title} page (\`${page.route}\`)`);
    for (const cid of page.component_ids) {
      const comp = spec.components.find((c) => c.id === cid);
      if (comp) tasks.push(`  - [ ] Build ${comp.name} component`);
    }
  }
  tasks.push("");

  tasks.push("## Phase 3: Data & Integration\n");
  for (const entity of mockData) {
    tasks.push(`- [ ] Replace mock ${entity.name} data with real data source`);
  }
  for (const svc of project.services) {
    tasks.push(`- [ ] Integrate ${svc} service`);
  }
  tasks.push("");

  tasks.push("## Phase 4: Polish & Production\n");
  tasks.push("- [ ] Add error boundaries and loading states");
  tasks.push("- [ ] Add SEO metadata to all pages");
  tasks.push("- [ ] Write tests for critical paths");
  tasks.push("- [ ] Performance audit and optimization");
  tasks.push("");

  return tasks.join("\n");
}

function tsType(fieldType: string): string {
  switch (fieldType) {
    case "string":
      return "string";
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "date":
      return "string";
    case "enum":
      return "string";
    case "relation":
      return "string";
    default:
      return "unknown";
  }
}

function camelCase(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function kebabCase(s: string): string {
  return s.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
}

function pascalCase(s: string): string {
  return s.replace(/(^|\s)\w/g, (m) => m.trim().toUpperCase()).replace(/\s+/g, "");
}

/**
 * Write export files to disk and optionally git init.
 */
export async function writeExportToDisk(
  projectPath: string,
  projectName: string,
  files: ExportFile[],
  gitInit: boolean,
): Promise<{ filesWritten: number; fullPath: string }> {
  const fullPath = path.join(expandTilde(projectPath), projectName);

  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
  }

  for (const file of files) {
    const filePath = path.join(fullPath, file.path);
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, file.content, "utf-8");
  }

  if (gitInit) {
    try {
      const { execSync } = await import("node:child_process");
      execSync("git init", { cwd: fullPath, stdio: "ignore" });
      execSync("git add .", { cwd: fullPath, stdio: "ignore" });
      execSync('git commit -m "Initial commit from Gadget Generator"', { cwd: fullPath, stdio: "ignore" });
    } catch {
      // git not available, skip
    }
  }

  return { filesWritten: files.length, fullPath };
}
