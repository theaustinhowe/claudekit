import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({
  createServiceLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import {
  createRepository,
  getAuthenticatedUser,
  getFileContent,
  getRepoBranches,
  getRepoInfo,
  getRepoTree,
  getUserOrgs,
} from "./github-client";

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

function mockFetchResponse(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    headers: new Headers({
      "x-ratelimit-remaining": "4999",
      "x-ratelimit-reset": "9999999999",
      ...headers,
    }),
  } as Response);
}

describe("github-client", () => {
  describe("getRepoBranches", () => {
    it("fetches branches from GitHub API", async () => {
      const branches = [{ name: "main", commit: { sha: "abc" }, protected: true }];
      mockFetchResponse(branches);

      const result = await getRepoBranches("token123", "owner", "repo");

      expect(result).toEqual(branches);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/repos/owner/repo/branches"),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: "Bearer token123" }),
        }),
      );
    });
  });

  describe("getRepoTree", () => {
    it("fetches and filters tree entries", async () => {
      const tree = {
        sha: "abc",
        tree: [
          { path: "src/index.ts", mode: "100644", type: "blob", sha: "1" },
          { path: "src", mode: "040000", type: "tree", sha: "2" },
        ],
        truncated: false,
      };
      mockFetchResponse(tree);

      const result = await getRepoTree("token", "owner", "repo", "main");

      // Filters out tree entries by default
      expect(result).toHaveLength(1);
      expect(result[0].path).toBe("src/index.ts");
    });

    it("includes directories when requested", async () => {
      const tree = {
        sha: "abc",
        tree: [
          { path: "src/index.ts", mode: "100644", type: "blob", sha: "1" },
          { path: "src", mode: "040000", type: "tree", sha: "2" },
        ],
        truncated: false,
      };
      mockFetchResponse(tree);

      const result = await getRepoTree("token", "owner", "repo", "main", true);

      expect(result).toHaveLength(2);
    });
  });

  describe("getRepoInfo", () => {
    it("extracts repo metadata", async () => {
      mockFetchResponse({
        stargazers_count: 42,
        pushed_at: "2024-01-01T00:00:00Z",
        topics: ["typescript", "ai"],
        description: "A cool repo",
      });

      const result = await getRepoInfo("token", "owner", "repo");

      expect(result).toEqual({
        stars: 42,
        pushed_at: "2024-01-01T00:00:00Z",
        topics: ["typescript", "ai"],
        description: "A cool repo",
      });
    });
  });

  describe("getFileContent", () => {
    it("decodes base64 content", async () => {
      const encoded = Buffer.from("hello world").toString("base64");
      mockFetchResponse({ content: encoded, encoding: "base64", name: "test.txt", path: "test.txt", sha: "abc" });

      const result = await getFileContent("token", "owner", "repo", "test.txt", "main");

      expect(result).toBe("hello world");
    });
  });

  describe("getAuthenticatedUser", () => {
    it("returns user info", async () => {
      mockFetchResponse({ login: "testuser", avatar_url: "https://example.com/avatar.png" });

      const result = await getAuthenticatedUser("token");

      expect(result.login).toBe("testuser");
    });
  });

  describe("getUserOrgs", () => {
    it("returns org list", async () => {
      mockFetchResponse([{ login: "my-org", avatar_url: "https://example.com/org.png" }]);

      const result = await getUserOrgs("token");

      expect(result).toHaveLength(1);
      expect(result[0].login).toBe("my-org");
    });
  });

  describe("createRepository", () => {
    it("creates a user repo", async () => {
      mockFetchResponse({
        html_url: "https://github.com/user/new-repo",
        clone_url: "https://github.com/user/new-repo.git",
        ssh_url: "git@github.com:user/new-repo.git",
        full_name: "user/new-repo",
        default_branch: "main",
      });

      const result = await createRepository("token", { name: "new-repo" });

      expect(result.html_url).toBe("https://github.com/user/new-repo");
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/user/repos"),
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("creates an org repo", async () => {
      mockFetchResponse({
        html_url: "https://github.com/org/new-repo",
        clone_url: "https://github.com/org/new-repo.git",
        ssh_url: "git@github.com:org/new-repo.git",
        full_name: "org/new-repo",
        default_branch: "main",
      });

      const result = await createRepository("token", { name: "new-repo", org: "my-org" });

      expect(result.full_name).toBe("org/new-repo");
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/orgs/my-org/repos"),
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  describe("error handling", () => {
    it("throws on 401", async () => {
      mockFetchResponse({}, 401);

      await expect(getAuthenticatedUser("bad-token")).rejects.toThrow("Invalid token");
    });

    it("throws on 404", async () => {
      mockFetchResponse({}, 404);

      await expect(getRepoInfo("token", "owner", "nonexistent")).rejects.toThrow("Not found");
    });
  });
});
