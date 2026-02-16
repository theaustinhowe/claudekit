import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

interface FileEntry {
  name: string;
  type: "file" | "directory";
  path: string;
  size: number;
}

interface FileTreeNode {
  name: string;
  type: "file" | "directory";
  children?: FileTreeNode[];
}

// Patterns to always skip
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  ".nuxt",
  ".svelte-kit",
  "dist",
  "build",
  ".turbo",
  ".cache",
  ".output",
  "__pycache__",
  ".venv",
  "venv",
  "coverage",
  ".nyc_output",
  ".parcel-cache",
  ".vercel",
  ".netlify",
]);

const SKIP_FILES = new Set([".DS_Store", "Thumbs.db", ".env", ".env.local", ".env.production"]);

export async function readDirectory(dirPath: string): Promise<FileEntry[]> {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    const results: FileEntry[] = [];

    for (const entry of entries) {
      const name = entry.name;
      const entryPath = join(dirPath, name);

      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(name)) continue;
        results.push({ name, type: "directory", path: entryPath, size: 0 });
      } else if (entry.isFile()) {
        if (SKIP_FILES.has(name)) continue;
        try {
          const info = await stat(entryPath);
          results.push({ name, type: "file", path: entryPath, size: info.size });
        } catch {
          results.push({ name, type: "file", path: entryPath, size: 0 });
        }
      }
    }

    results.sort((a, b) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return results;
  } catch {
    return [];
  }
}

export async function buildFileTree(dirPath: string, maxDepth = 5, currentDepth = 0): Promise<FileTreeNode[]> {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    const nodes: FileTreeNode[] = [];

    for (const entry of entries) {
      const name = entry.name;

      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(name)) continue;
        const node: FileTreeNode = { name, type: "directory" };
        if (currentDepth < maxDepth) {
          node.children = await buildFileTree(join(dirPath, name), maxDepth, currentDepth + 1);
        }
        nodes.push(node);
      } else if (entry.isFile()) {
        if (SKIP_FILES.has(name)) continue;
        nodes.push({ name, type: "file" });
      }
    }

    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return nodes;
  } catch {
    return [];
  }
}

async function readPackageJson(dirPath: string): Promise<Record<string, unknown> | null> {
  try {
    const content = await readFile(join(dirPath, "package.json"), "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function getDep(pkg: Record<string, unknown>, name: string): string | undefined {
  const deps = pkg.dependencies as Record<string, string> | undefined;
  const devDeps = pkg.devDependencies as Record<string, string> | undefined;
  return deps?.[name] ?? devDeps?.[name];
}

function cleanVersion(raw: string): string {
  return raw.replace(/^[\^~>=<]*/, "");
}

async function dirExists(path: string): Promise<boolean> {
  try {
    const info = await stat(path);
    return info.isDirectory();
  } catch {
    return false;
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    const info = await stat(path);
    return info.isFile();
  } catch {
    return false;
  }
}

export async function detectFramework(dirPath: string): Promise<string> {
  try {
    const pkg = await readPackageJson(dirPath);

    if (pkg) {
      // Next.js
      const nextVersion = getDep(pkg, "next");
      if (nextVersion) {
        const hasAppDir = (await dirExists(join(dirPath, "app"))) || (await dirExists(join(dirPath, "src", "app")));
        const router = hasAppDir ? "App Router" : "Pages Router";
        return `Next.js ${cleanVersion(nextVersion)} (${router})`;
      }

      // Nuxt
      const nuxtVersion = getDep(pkg, "nuxt");
      if (nuxtVersion) return `Nuxt ${cleanVersion(nuxtVersion)}`;

      // SvelteKit
      const skVersion = getDep(pkg, "@sveltejs/kit");
      if (skVersion) return `SvelteKit ${cleanVersion(skVersion)}`;

      // Gatsby
      const gatsbyVersion = getDep(pkg, "gatsby");
      if (gatsbyVersion) return `Gatsby ${cleanVersion(gatsbyVersion)}`;

      // Remix
      const remixVersion = getDep(pkg, "@remix-run/react") ?? getDep(pkg, "remix");
      if (remixVersion) return `Remix ${cleanVersion(remixVersion)}`;

      // Angular
      const angularVersion = getDep(pkg, "@angular/core");
      if (angularVersion) return `Angular ${cleanVersion(angularVersion)}`;

      // Vite (qualified by frontend framework)
      const viteVersion = getDep(pkg, "vite");
      if (viteVersion) {
        const reactDep = getDep(pkg, "react");
        const vueDep = getDep(pkg, "vue");
        const svelteDep = getDep(pkg, "svelte");
        if (reactDep) return `Vite ${cleanVersion(viteVersion)} (React)`;
        if (vueDep) return `Vite ${cleanVersion(viteVersion)} (Vue)`;
        if (svelteDep) return `Vite ${cleanVersion(viteVersion)} (Svelte)`;
        return `Vite ${cleanVersion(viteVersion)}`;
      }

      // Express
      const expressVersion = getDep(pkg, "express");
      if (expressVersion) return `Express ${cleanVersion(expressVersion)}`;

      // Astro
      const astroVersion = getDep(pkg, "astro");
      if (astroVersion) return `Astro ${cleanVersion(astroVersion)}`;

      // Hono
      const honoVersion = getDep(pkg, "hono");
      if (honoVersion) return `Hono ${cleanVersion(honoVersion)}`;

      // Fastify
      const fastifyVersion = getDep(pkg, "fastify");
      if (fastifyVersion) return `Fastify ${cleanVersion(fastifyVersion)}`;
    }

    // Non-JS fallbacks
    if (await fileExists(join(dirPath, "requirements.txt"))) return "Python";
    if (await fileExists(join(dirPath, "Cargo.toml"))) return "Rust";
    if (await fileExists(join(dirPath, "go.mod"))) return "Go";

    return "Unknown";
  } catch {
    return "Unknown";
  }
}

export async function detectAuth(dirPath: string): Promise<string> {
  try {
    const pkg = await readPackageJson(dirPath);

    if (pkg) {
      if (getDep(pkg, "next-auth")) return "NextAuth";
      if (getDep(pkg, "@auth/core")) return "Auth.js";
      if (getDep(pkg, "passport")) return "Passport.js";
      if (getDep(pkg, "@clerk/nextjs")) return "Clerk";
      if (getDep(pkg, "@supabase/auth-helpers-nextjs") || getDep(pkg, "@supabase/auth-helpers")) return "Supabase Auth";
      if (getDep(pkg, "firebase")) return "Firebase Auth";
      if (getDep(pkg, "jsonwebtoken")) return "JWT";
      if (getDep(pkg, "@nhost/nhost-js") || getDep(pkg, "@nhost/react")) return "Nhost Auth";
      if (getDep(pkg, "@auth0/nextjs-auth0") || getDep(pkg, "auth0")) return "Auth0";
      if (getDep(pkg, "lucia") || getDep(pkg, "lucia-auth")) return "Lucia";
      if (getDep(pkg, "@kinde-oss/kinde-auth-nextjs")) return "Kinde";
      if (getDep(pkg, "better-auth")) return "Better Auth";
    }

    // Check for auth-related directories
    const authDirs = [
      join(dirPath, "src", "auth"),
      join(dirPath, "app", "auth"),
      join(dirPath, "lib", "auth"),
      join(dirPath, "src", "lib", "auth"),
    ];

    for (const authDir of authDirs) {
      if (await dirExists(authDir)) return "Custom auth detected";
    }

    return "None detected";
  } catch {
    return "None detected";
  }
}

export async function detectDatabase(dirPath: string): Promise<string> {
  try {
    const pkg = await readPackageJson(dirPath);

    if (pkg) {
      // Prisma — try to detect the provider from schema
      if (getDep(pkg, "prisma") || getDep(pkg, "@prisma/client")) {
        let provider = "";
        try {
          const schemaPath = join(dirPath, "prisma", "schema.prisma");
          const schema = await readFile(schemaPath, "utf-8");
          const match = schema.match(/provider\s*=\s*"(postgresql|mysql|sqlite|mongodb|sqlserver)"/);
          if (match) {
            const providerNames: Record<string, string> = {
              postgresql: "PostgreSQL",
              mysql: "MySQL",
              sqlite: "SQLite",
              mongodb: "MongoDB",
              sqlserver: "SQL Server",
            };
            provider = ` (${providerNames[match[1]] ?? match[1]})`;
          }
        } catch {
          // schema not found, that's fine
        }
        return `Prisma${provider}`;
      }

      if (getDep(pkg, "drizzle-orm")) return "Drizzle ORM";
      if (getDep(pkg, "typeorm")) return "TypeORM";
      if (getDep(pkg, "mongoose")) return "MongoDB (Mongoose)";
      if (getDep(pkg, "pg")) return "PostgreSQL";
      if (getDep(pkg, "mysql2")) return "MySQL";
      if (getDep(pkg, "better-sqlite3")) return "SQLite";
      if (getDep(pkg, "@supabase/supabase-js")) return "Supabase";
      if (getDep(pkg, "@planetscale/database")) return "PlanetScale";
      if (getDep(pkg, "@duckdb/node-api") || getDep(pkg, "duckdb") || getDep(pkg, "@duckdb/duckdb-wasm"))
        return "DuckDB";

      // Nhost
      if (getDep(pkg, "@nhost/nhost-js") || getDep(pkg, "@nhost/react") || getDep(pkg, "@nhost/nextjs"))
        return "Nhost (PostgreSQL + Hasura)";
      // Hasura
      if (getDep(pkg, "@hasura/metadata") || getDep(pkg, "hasura-cli")) return "Hasura (GraphQL)";
      // Kysely
      if (getDep(pkg, "kysely")) return "Kysely";
      // Knex
      if (getDep(pkg, "knex")) return "Knex.js";
      // Sequelize
      if (getDep(pkg, "sequelize")) return "Sequelize";
      // Turso/libSQL
      if (getDep(pkg, "@libsql/client") || getDep(pkg, "@tursodatabase/libsql")) return "Turso (libSQL)";
      // Convex
      if (getDep(pkg, "convex")) return "Convex";
      // Firebase Firestore
      if (getDep(pkg, "firebase-admin") || getDep(pkg, "@firebase/firestore")) return "Firebase Firestore";
      // Redis
      if (getDep(pkg, "redis") || getDep(pkg, "ioredis") || getDep(pkg, "@upstash/redis")) return "Redis";
    }

    // Check docker-compose for database services
    const composeNames = ["docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"];
    for (const name of composeNames) {
      try {
        const content = await readFile(join(dirPath, name), "utf-8");
        if (content.includes("hasura")) return "Hasura (Docker)";
        if (content.includes("postgres")) return "PostgreSQL (Docker)";
        if (content.includes("mysql") || content.includes("mariadb")) return "MySQL (Docker)";
        if (content.includes("mongo")) return "MongoDB (Docker)";
      } catch {
        /* file doesn't exist */
      }
    }

    return "None detected";
  } catch {
    return "None detected";
  }
}

export async function detectKeyDirectories(dirPath: string): Promise<string[]> {
  const candidates = [
    "src",
    "app",
    "pages",
    "components",
    "lib",
    "utils",
    "api",
    "routes",
    "public",
    "assets",
    "styles",
    "prisma",
    "drizzle",
    "tests",
  ];

  const found: string[] = [];

  for (const dir of candidates) {
    if (await dirExists(join(dirPath, dir))) {
      found.push(dir);
    }
  }

  return found;
}
