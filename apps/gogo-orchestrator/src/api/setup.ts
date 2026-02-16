import * as fs from "node:fs";
import * as path from "node:path";
import type { FastifyPluginAsync } from "fastify";
import { Octokit } from "octokit";
import { z } from "zod";
import { queryAll, queryOne } from "../db/helpers.js";
import { getConn } from "../db/index.js";
import { type DbRepository, mapRepositoryFull } from "../db/schema.js";

// Validation schemas
const VerifyGitHubSchema = z.object({
  token: z.string().min(1, "Token is required"),
});

const VerifyRepositorySchema = z.object({
  token: z.string().optional(), // Optional if reuseTokenFromRepoId is provided
  reuseTokenFromRepoId: z.string().uuid().optional(),
  owner: z.string().min(1, "Owner is required"),
  name: z.string().min(1, "Repository name is required"),
});

const VerifyWorkspaceSchema = z.object({
  path: z.string().min(1, "Path is required"),
});

const CompleteSetupSchema = z.object({
  githubToken: z.string().optional(), // Optional if reuseTokenFromRepoId is provided
  reuseTokenFromRepoId: z.string().uuid().optional(), // Reuse token from existing repo
  owner: z.string().min(1),
  name: z.string().min(1),
  triggerLabel: z.string().default("agent"),
  baseBranch: z.string().default("main"),
  workdirPath: z.string().min(1),
});

const DiscoverReposSchema = z.object({
  path: z.string().min(1, "Path is required"),
  maxDepth: z.number().optional().default(3),
});

const BrowseDirectorySchema = z.object({
  path: z.string().min(1, "Path is required"),
});

interface DiscoveredRepo {
  path: string;
  owner: string | null;
  name: string | null;
  remoteUrl: string | null;
  currentBranch: string;
}

// Parse GitHub remote URL to extract owner and name
function parseGitHubRemoteUrl(
  url: string,
): { owner: string; name: string } | null {
  // Handle SSH format: git@github.com:owner/name.git
  const sshMatch = url.match(/git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (sshMatch) {
    return { owner: sshMatch[1], name: sshMatch[2] };
  }

  // Handle HTTPS format: https://github.com/owner/name.git
  const httpsMatch = url.match(
    /https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/,
  );
  if (httpsMatch) {
    return { owner: httpsMatch[1], name: httpsMatch[2] };
  }

  return null;
}

// Read git config and extract remote URL
function getGitRemoteUrl(gitDir: string): string | null {
  try {
    const configPath = path.join(gitDir, "config");
    const configContent = fs.readFileSync(configPath, "utf-8");

    // Look for [remote "origin"] section and extract url
    const remoteOriginMatch = configContent.match(
      /\[remote "origin"\][^[]*url\s*=\s*(.+)/,
    );
    if (remoteOriginMatch) {
      return remoteOriginMatch[1].trim();
    }

    return null;
  } catch {
    return null;
  }
}

// Read current branch from HEAD
function getCurrentBranch(gitDir: string): string {
  try {
    const headPath = path.join(gitDir, "HEAD");
    const headContent = fs.readFileSync(headPath, "utf-8").trim();

    // Handle symbolic ref: ref: refs/heads/branch-name
    const refMatch = headContent.match(/^ref: refs\/heads\/(.+)$/);
    if (refMatch) {
      return refMatch[1];
    }

    // Detached HEAD - return shortened commit hash
    return headContent.substring(0, 7);
  } catch {
    return "unknown";
  }
}

// Recursively find git repositories
function findGitRepos(
  dir: string,
  maxDepth: number,
  currentDepth = 0,
): DiscoveredRepo[] {
  const repos: DiscoveredRepo[] = [];

  if (currentDepth > maxDepth) {
    return repos;
  }

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      // Skip hidden directories except .git
      if (entry.name.startsWith(".") && entry.name !== ".git") continue;

      const fullPath = path.join(dir, entry.name);

      if (entry.name === ".git") {
        // Found a git repo
        const repoPath = dir;
        const remoteUrl = getGitRemoteUrl(fullPath);
        const parsed = remoteUrl ? parseGitHubRemoteUrl(remoteUrl) : null;
        const currentBranch = getCurrentBranch(fullPath);

        repos.push({
          path: repoPath,
          owner: parsed?.owner ?? null,
          name: parsed?.name ?? null,
          remoteUrl,
          currentBranch,
        });
      } else {
        // Continue searching subdirectories
        repos.push(...findGitRepos(fullPath, maxDepth, currentDepth + 1));
      }
    }
  } catch {
    // Ignore permission errors or other issues
  }

  return repos;
}

export const setupRouter: FastifyPluginAsync = async (fastify) => {
  // Check if setup is needed (no active repositories configured)
  fastify.get("/status", async () => {
    const conn = getConn();
    const activeRepos = await queryAll<DbRepository>(
      conn,
      "SELECT * FROM repositories WHERE is_active = true",
    );

    return {
      needsSetup: activeRepos.length === 0,
      repositoryCount: activeRepos.length,
    };
  });

  // Verify GitHub token and return user info + scopes
  fastify.post<{ Body: unknown }>("/verify-github", async (request, reply) => {
    const parsed = VerifyGitHubSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: "Invalid request",
        details: parsed.error.format(),
      });
    }

    const { token } = parsed.data;

    try {
      const octokit = new Octokit({ auth: token });

      // Get authenticated user
      const { data: user } = await octokit.rest.users.getAuthenticated();

      // Get rate limit info to verify token works
      const { data: rateLimit } = await octokit.rest.rateLimit.get();

      // Check scopes from response headers (we need repo scope at minimum)
      // Note: Octokit doesn't expose headers directly, so we verify by testing permissions
      const scopes: string[] = [];

      // Test repo access by listing some repos
      try {
        await octokit.rest.repos.listForAuthenticatedUser({ per_page: 1 });
        scopes.push("repo");
      } catch {
        // No repo scope
      }

      // Test issues access
      try {
        // If we got repo scope, issues are included
        if (scopes.includes("repo")) {
          scopes.push("issues");
        }
      } catch {
        // No issues scope
      }

      return {
        success: true,
        data: {
          username: user.login,
          name: user.name,
          avatarUrl: user.avatar_url,
          scopes,
          rateLimit: {
            limit: rateLimit.rate.limit,
            remaining: rateLimit.rate.remaining,
            reset: new Date(rateLimit.rate.reset * 1000).toISOString(),
          },
        },
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to verify token";

      // Check for specific error types
      if (message.includes("Bad credentials")) {
        return reply.status(401).send({
          success: false,
          error:
            "Invalid token. Please check your GitHub Personal Access Token.",
        });
      }

      return reply.status(500).send({
        success: false,
        error: message,
      });
    }
  });

  // Verify repository access
  fastify.post<{ Body: unknown }>(
    "/verify-repository",
    async (request, reply) => {
      const parsed = VerifyRepositorySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: "Invalid request",
          details: parsed.error.format(),
        });
      }

      const { token, reuseTokenFromRepoId, owner, name } = parsed.data;

      // Resolve the token
      let resolvedToken = token;
      if (!resolvedToken && reuseTokenFromRepoId) {
        const conn = getConn();
        const existingRepo = await queryOne<{ github_token: string }>(
          conn,
          "SELECT github_token FROM repositories WHERE id = ?",
          [reuseTokenFromRepoId],
        );

        if (!existingRepo) {
          return reply.status(400).send({
            success: false,
            error: "Referenced repository not found for token reuse",
          });
        }
        resolvedToken = existingRepo.github_token;
      }

      if (!resolvedToken) {
        return reply.status(400).send({
          success: false,
          error: "Either token or reuseTokenFromRepoId must be provided",
        });
      }

      try {
        const octokit = new Octokit({ auth: resolvedToken });

        // Get repository info
        const { data: repo } = await octokit.rest.repos.get({
          owner,
          repo: name,
        });

        // Check if we have push access
        const canPush = repo.permissions?.push ?? false;

        return {
          success: true,
          data: {
            fullName: repo.full_name,
            visibility: repo.private ? "private" : "public",
            defaultBranch: repo.default_branch,
            openIssuesCount: repo.open_issues_count,
            canPush,
            description: repo.description,
          },
        };
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to verify repository";

        if (message.includes("Not Found")) {
          return reply.status(404).send({
            success: false,
            error: `Repository not found: ${owner}/${name}. Check that it exists and you have access.`,
          });
        }

        return reply.status(500).send({
          success: false,
          error: message,
        });
      }
    },
  );

  // Verify workspace directory
  fastify.post<{ Body: unknown }>(
    "/verify-workspace",
    async (request, reply) => {
      const parsed = VerifyWorkspaceSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: "Invalid request",
          details: parsed.error.format(),
        });
      }

      const { path: workspacePath } = parsed.data;

      try {
        // Normalize and resolve path
        const resolvedPath = path.resolve(workspacePath);

        // Check if directory exists
        let exists = false;
        let writable = false;

        try {
          const stats = fs.statSync(resolvedPath);
          exists = stats.isDirectory();

          if (exists) {
            // Test write access by trying to create a temp file
            const testFile = path.join(
              resolvedPath,
              `.agent-write-test-${Date.now()}`,
            );
            try {
              fs.writeFileSync(testFile, "test");
              fs.unlinkSync(testFile);
              writable = true;
            } catch {
              writable = false;
            }
          }
        } catch {
          exists = false;
        }

        // If directory doesn't exist, check if parent is writable (can create it)
        let canCreate = false;
        if (!exists) {
          const parentDir = path.dirname(resolvedPath);
          try {
            const parentStats = fs.statSync(parentDir);
            if (parentStats.isDirectory()) {
              const testFile = path.join(
                parentDir,
                `.agent-write-test-${Date.now()}`,
              );
              try {
                fs.writeFileSync(testFile, "test");
                fs.unlinkSync(testFile);
                canCreate = true;
              } catch {
                canCreate = false;
              }
            }
          } catch {
            canCreate = false;
          }
        }

        return {
          success: true,
          data: {
            path: resolvedPath,
            exists,
            writable: exists ? writable : canCreate,
            canCreate,
          },
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to verify workspace";

        return reply.status(500).send({
          success: false,
          error: message,
        });
      }
    },
  );

  // Browse directory - list subdirectories for directory picker
  fastify.post<{ Body: unknown }>(
    "/browse-directory",
    async (request, reply) => {
      const parsed = BrowseDirectorySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: "Invalid request",
          details: parsed.error.format(),
        });
      }

      const { path: browsePath } = parsed.data;

      try {
        // Normalize and resolve path (handle ~ for home directory)
        let resolvedPath = browsePath;
        if (browsePath.startsWith("~")) {
          const homeDir = process.env.HOME || process.env.USERPROFILE || "";
          resolvedPath = path.join(homeDir, browsePath.slice(1));
        }
        resolvedPath = path.resolve(resolvedPath);

        // Check if directory exists
        try {
          const stats = fs.statSync(resolvedPath);
          if (!stats.isDirectory()) {
            return reply.status(400).send({
              success: false,
              error: "Path is not a directory",
            });
          }
        } catch {
          return reply.status(404).send({
            success: false,
            error: "Directory not found",
          });
        }

        // List subdirectories
        const entries = fs.readdirSync(resolvedPath, { withFileTypes: true });
        const directories: string[] = [];

        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          // Skip hidden directories
          if (entry.name.startsWith(".")) continue;
          directories.push(entry.name);
        }

        directories.sort((a, b) =>
          a.localeCompare(b, undefined, { sensitivity: "base" }),
        );

        return {
          success: true,
          data: {
            path: resolvedPath,
            parent: path.dirname(resolvedPath),
            directories,
          },
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to browse directory";

        return reply.status(500).send({
          success: false,
          error: message,
        });
      }
    },
  );

  // Discover git repositories in a directory
  fastify.post<{ Body: unknown }>("/discover-repos", async (request, reply) => {
    const parsed = DiscoverReposSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: "Invalid request",
        details: parsed.error.format(),
      });
    }

    const { path: scanPath, maxDepth } = parsed.data;

    try {
      // Normalize and resolve path (handle ~ for home directory)
      let resolvedPath = scanPath;
      if (scanPath.startsWith("~")) {
        const homeDir = process.env.HOME || process.env.USERPROFILE || "";
        resolvedPath = path.join(homeDir, scanPath.slice(1));
      }
      resolvedPath = path.resolve(resolvedPath);

      // Check if directory exists
      try {
        const stats = fs.statSync(resolvedPath);
        if (!stats.isDirectory()) {
          return reply.status(400).send({
            success: false,
            error: "Path is not a directory",
          });
        }
      } catch {
        return reply.status(404).send({
          success: false,
          error: "Directory not found",
        });
      }

      // Find git repositories
      const repos = findGitRepos(resolvedPath, maxDepth);

      return {
        success: true,
        data: {
          repos,
          scannedPath: resolvedPath,
        },
      };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to discover repositories";

      return reply.status(500).send({
        success: false,
        error: message,
      });
    }
  });

  // Complete setup - create repository record
  fastify.post<{ Body: unknown }>("/complete", async (request, reply) => {
    const parsed = CompleteSetupSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: "Invalid request",
        details: parsed.error.format(),
      });
    }

    const {
      githubToken,
      reuseTokenFromRepoId,
      owner,
      name,
      triggerLabel,
      baseBranch,
      workdirPath,
    } = parsed.data;

    const conn = getConn();

    // Resolve the token - either use provided or fetch from existing repo
    let resolvedToken = githubToken;
    if (!resolvedToken && reuseTokenFromRepoId) {
      const existingRepo = await queryOne<{ github_token: string }>(
        conn,
        "SELECT github_token FROM repositories WHERE id = ?",
        [reuseTokenFromRepoId],
      );

      if (!existingRepo) {
        return reply.status(400).send({
          success: false,
          error: "Referenced repository not found for token reuse",
        });
      }
      resolvedToken = existingRepo.github_token;
    }

    if (!resolvedToken) {
      return reply.status(400).send({
        success: false,
        error: "Either githubToken or reuseTokenFromRepoId must be provided",
      });
    }

    const finalToken = resolvedToken;

    try {
      // Ensure workspace directory exists
      const resolvedPath = path.resolve(workdirPath);
      if (!fs.existsSync(resolvedPath)) {
        fs.mkdirSync(resolvedPath, { recursive: true });
      }

      // Check if repository already exists
      const existing = await queryOne<DbRepository>(
        conn,
        "SELECT * FROM repositories WHERE owner = ?",
        [owner],
      );

      if (existing) {
        const existingMapped = mapRepositoryFull(existing);
        if (existingMapped.name === name) {
          // Update existing repository
          const now = new Date().toISOString();
          const updated = await queryOne<DbRepository>(
            conn,
            `UPDATE repositories SET github_token = ?, trigger_label = ?, base_branch = ?, workdir_path = ?, is_active = true, updated_at = ?
             WHERE id = ?
             RETURNING *`,
            [
              finalToken,
              triggerLabel,
              baseBranch,
              resolvedPath,
              now,
              existingMapped.id,
            ],
          );

          if (!updated) {
            return reply.status(500).send({
              success: false,
              error: "Failed to update repository",
            });
          }

          const updatedMapped = mapRepositoryFull(updated);
          return {
            success: true,
            data: {
              id: updatedMapped.id,
              owner: updatedMapped.owner,
              name: updatedMapped.name,
              isNew: false,
            },
          };
        }
      }

      // Create new repository
      const now = new Date().toISOString();
      const newRepo = await queryOne<DbRepository>(
        conn,
        `INSERT INTO repositories (owner, name, display_name, github_token, base_branch, trigger_label, workdir_path, is_active, auto_create_jobs, remove_label_after_create, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, true, true, false, ?, ?)
         RETURNING *`,
        [
          owner,
          name,
          `${owner}/${name}`,
          finalToken,
          baseBranch,
          triggerLabel,
          resolvedPath,
          now,
          now,
        ],
      );

      if (!newRepo) {
        return reply.status(500).send({
          success: false,
          error: "Failed to create repository",
        });
      }

      const newMapped = mapRepositoryFull(newRepo);
      return {
        success: true,
        data: {
          id: newMapped.id,
          owner: newMapped.owner,
          name: newMapped.name,
          isNew: true,
        },
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to complete setup";

      return reply.status(500).send({
        success: false,
        error: message,
      });
    }
  });
};
