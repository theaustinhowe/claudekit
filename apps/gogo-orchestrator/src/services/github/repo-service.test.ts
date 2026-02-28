import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the database
vi.mock("../../db/index.js", () => ({
  getDb: vi.fn(async () => ({})),
}));

vi.mock("@claudekit/duckdb", () => ({
  queryAll: vi.fn(),
  queryOne: vi.fn(),
  execute: vi.fn(),
  withTransaction: vi.fn(),
  buildUpdate: vi.fn(),
  buildWhere: vi.fn(),
  buildInClause: vi.fn(),
  checkpoint: vi.fn(),
}));

// Mock the timeout utility - pass through the promise
vi.mock("../../utils/timeout.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../utils/timeout.js")>();
  return {
    ...actual,
    withTimeout: vi.fn(async <T>(promise: Promise<T>) => promise),
  };
});

// Mock the client module
vi.mock("./client.js", () => ({
  getOctokitForRepo: vi.fn(),
}));

import { queryOne } from "@claudekit/duckdb";
import { cast } from "@claudekit/test-utils";
import { withTimeout } from "../../utils/timeout.js";
import { getOctokitForRepo } from "./client.js";
import { RepositoryNotFoundError } from "./errors.js";
import {
  AGENT_COMMENT_MARKER,
  createIssueCommentForRepo,
  findExistingPrForRepo,
  getIssueCommentsForRepo,
  getIssuesWithLabel,
  getRepoConfigById,
  hasAgentMarker,
  isHumanComment,
  isHumanReviewComment,
  removeLabelFromIssue,
} from "./repo-service.js";

// Helper to set up db mock for repository config
function mockDbForRepo(repoData: Record<string, unknown> | null) {
  vi.mocked(queryOne).mockResolvedValue(repoData ?? undefined);
}

const mockRepoData = {
  id: "repo-1",
  owner: "testowner",
  name: "testrepo",
  base_branch: "main",
  trigger_label: "agent:run",
};

describe("Repo Service", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Reset withTimeout to pass through
    vi.mocked(withTimeout).mockImplementation(async <T>(promise: Promise<T>) => promise);
  });

  describe("getRepoConfigById", () => {
    it("returns repository config for valid ID", async () => {
      mockDbForRepo(mockRepoData);

      const config = await getRepoConfigById("repo-1");

      expect(config.owner).toBe("testowner");
      expect(config.name).toBe("testrepo");
      expect(config.baseBranch).toBe("main");
      expect(config.triggerLabel).toBe("agent:run");
    });

    it("throws RepositoryNotFoundError for invalid ID", async () => {
      mockDbForRepo(null);

      await expect(getRepoConfigById("nonexistent")).rejects.toThrow(RepositoryNotFoundError);
    });
  });

  describe("getIssuesWithLabel", () => {
    it("fetches issues with label from GitHub", async () => {
      const mockOctokit = {
        rest: {
          issues: {
            listForRepo: vi.fn().mockResolvedValue({
              data: [
                {
                  number: 1,
                  title: "Test Issue",
                  body: "Test body",
                  html_url: "https://github.com/test/repo/issues/1",
                  state: "open",
                },
              ],
            }),
          },
        },
      };

      vi.mocked(getOctokitForRepo).mockResolvedValue(cast(mockOctokit));
      mockDbForRepo(mockRepoData);

      const issues = await getIssuesWithLabel("repo-1", "agent:run");

      expect(issues).toHaveLength(1);
      expect(issues[0].number).toBe(1);
      expect(issues[0].title).toBe("Test Issue");
    });

    it("returns empty array on error", async () => {
      const mockOctokit = {
        rest: {
          issues: {
            listForRepo: vi.fn().mockRejectedValue(new Error("API Error")),
          },
        },
      };

      vi.mocked(getOctokitForRepo).mockResolvedValue(cast(mockOctokit));
      mockDbForRepo(mockRepoData);

      const issues = await getIssuesWithLabel("repo-1", "agent:run");

      expect(issues).toHaveLength(0);
    });
  });

  describe("createIssueCommentForRepo", () => {
    it("creates comment on issue", async () => {
      const mockOctokit = {
        rest: {
          issues: {
            createComment: vi.fn().mockResolvedValue({
              data: {
                id: 12345,
                html_url: "https://github.com/test/repo/issues/1#issuecomment-12345",
              },
            }),
          },
        },
      };

      vi.mocked(getOctokitForRepo).mockResolvedValue(cast(mockOctokit));
      mockDbForRepo(mockRepoData);

      const result = await createIssueCommentForRepo("repo-1", 1, "Test comment");

      expect(result.id).toBe(12345);
      expect(result.html_url).toContain("issuecomment-12345");
    });
  });

  describe("getIssueCommentsForRepo", () => {
    it("fetches comments from GitHub", async () => {
      const mockOctokit = {
        rest: {
          issues: {
            listComments: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 100,
                  body: "Comment 1",
                  html_url: "https://github.com/test/repo/issues/1#issuecomment-100",
                  user: {
                    login: "user1",
                    type: "User",
                    avatar_url: "https://avatars.githubusercontent.com/u/1",
                  },
                  created_at: "2024-01-01T00:00:00Z",
                },
                {
                  id: 101,
                  body: "Comment 2",
                  html_url: "https://github.com/test/repo/issues/1#issuecomment-101",
                  user: {
                    login: "user2",
                    type: "User",
                    avatar_url: "https://avatars.githubusercontent.com/u/2",
                  },
                  created_at: "2024-01-01T01:00:00Z",
                },
              ],
            }),
          },
        },
      };

      vi.mocked(getOctokitForRepo).mockResolvedValue(cast(mockOctokit));
      mockDbForRepo(mockRepoData);

      const comments = await getIssueCommentsForRepo("repo-1", 1);

      expect(comments).toHaveLength(2);
      expect(comments[0].id).toBe(100);
      expect(comments[1].id).toBe(101);
    });

    it("filters comments by sinceCommentId", async () => {
      const mockOctokit = {
        rest: {
          issues: {
            listComments: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 100,
                  body: "Comment 1",
                  html_url: "url1",
                  user: {
                    login: "user1",
                    type: "User",
                    avatar_url: "https://avatars.githubusercontent.com/u/1",
                  },
                  created_at: "2024-01-01T00:00:00Z",
                },
                {
                  id: 101,
                  body: "Comment 2",
                  html_url: "url2",
                  user: {
                    login: "user2",
                    type: "User",
                    avatar_url: "https://avatars.githubusercontent.com/u/2",
                  },
                  created_at: "2024-01-01T01:00:00Z",
                },
              ],
            }),
          },
        },
      };

      vi.mocked(getOctokitForRepo).mockResolvedValue(cast(mockOctokit));
      mockDbForRepo(mockRepoData);

      const comments = await getIssueCommentsForRepo("repo-1", 1, 100);

      expect(comments).toHaveLength(1);
      expect(comments[0].id).toBe(101);
    });
  });

  describe("removeLabelFromIssue", () => {
    it("removes label from issue", async () => {
      const removeLabel = vi.fn().mockResolvedValue({});
      const mockOctokit = {
        rest: {
          issues: {
            removeLabel,
          },
        },
      };

      vi.mocked(getOctokitForRepo).mockResolvedValue(cast(mockOctokit));
      mockDbForRepo(mockRepoData);

      await removeLabelFromIssue("repo-1", 1, "agent:run");

      expect(removeLabel).toHaveBeenCalledWith({
        owner: "testowner",
        repo: "testrepo",
        issue_number: 1,
        name: "agent:run",
      });
    });

    it("handles missing label gracefully", async () => {
      const removeLabel = vi.fn().mockRejectedValue(new Error("Label not found"));
      const mockOctokit = {
        rest: {
          issues: {
            removeLabel,
          },
        },
      };

      vi.mocked(getOctokitForRepo).mockResolvedValue(cast(mockOctokit));
      mockDbForRepo(mockRepoData);

      // Should not throw
      await removeLabelFromIssue("repo-1", 1, "agent:run");
    });
  });

  describe("findExistingPrForRepo", () => {
    it("finds existing PR for branch", async () => {
      const mockOctokit = {
        rest: {
          pulls: {
            list: vi.fn().mockResolvedValue({
              data: [
                {
                  number: 42,
                  html_url: "https://github.com/test/repo/pull/42",
                },
              ],
            }),
          },
        },
      };

      vi.mocked(getOctokitForRepo).mockResolvedValue(cast(mockOctokit));
      mockDbForRepo(mockRepoData);

      const result = await findExistingPrForRepo("repo-1", "feature-branch");

      expect(result?.number).toBe(42);
      expect(result?.html_url).toContain("pull/42");
    });

    it("returns null when no PR exists", async () => {
      const mockOctokit = {
        rest: {
          pulls: {
            list: vi.fn().mockResolvedValue({
              data: [],
            }),
          },
        },
      };

      vi.mocked(getOctokitForRepo).mockResolvedValue(cast(mockOctokit));
      mockDbForRepo(mockRepoData);

      const result = await findExistingPrForRepo("repo-1", "feature-branch");

      expect(result).toBeNull();
    });
  });

  describe("hasAgentMarker", () => {
    it("returns true when body contains the marker", () => {
      const body = `${AGENT_COMMENT_MARKER}\n**Agent Question:**\n\nWhat branch?`;
      expect(hasAgentMarker(body)).toBe(true);
    });

    it("returns false for plain text", () => {
      expect(hasAgentMarker("Just a normal comment")).toBe(false);
    });

    it("returns true when marker is embedded in other content", () => {
      const body = `Some text\n${AGENT_COMMENT_MARKER}\nMore text`;
      expect(hasAgentMarker(body)).toBe(true);
    });
  });

  describe("isHumanComment", () => {
    it("returns true for human comments", () => {
      const comment = {
        id: 1,
        body: "Test",
        html_url: "url",
        user: {
          login: "humanuser",
          type: "User",
          avatar_url: "https://avatars.githubusercontent.com/u/1",
        },
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

      expect(isHumanComment(comment)).toBe(true);
    });

    it("returns false for Bot type users", () => {
      const comment = {
        id: 1,
        body: "Test",
        html_url: "url",
        user: {
          login: "dependabot",
          type: "Bot",
          avatar_url: "https://avatars.githubusercontent.com/u/1",
        },
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

      expect(isHumanComment(comment)).toBe(false);
    });

    it("returns false for [bot] username suffix", () => {
      const comment = {
        id: 1,
        body: "Test",
        html_url: "url",
        user: {
          login: "github-actions[bot]",
          type: "User",
          avatar_url: "https://avatars.githubusercontent.com/u/1",
        },
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

      expect(isHumanComment(comment)).toBe(false);
    });

    it("returns false for null user", () => {
      const comment = {
        id: 1,
        body: "Test",
        html_url: "url",
        user: null,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

      expect(isHumanComment(comment)).toBe(false);
    });

    it("returns false for comments with agent marker", () => {
      const comment = {
        id: 1,
        body: `${AGENT_COMMENT_MARKER}\n**Agent Question:**\n\nWhat branch?`,
        html_url: "url",
        user: {
          login: "humanuser",
          type: "User",
          avatar_url: "https://avatars.githubusercontent.com/u/1",
        },
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

      expect(isHumanComment(comment)).toBe(false);
    });
  });

  describe("isHumanReviewComment", () => {
    it("returns true for human review comments", () => {
      const comment = {
        id: 1,
        body: "Please fix this",
        html_url: "url",
        user: { login: "reviewer", type: "User" },
        created_at: "2024-01-01T00:00:00Z",
        path: "src/index.ts",
        line: 10,
      };

      expect(isHumanReviewComment(comment)).toBe(true);
    });

    it("returns false for Bot type review comments", () => {
      const comment = {
        id: 1,
        body: "Automated review",
        html_url: "url",
        user: { login: "codebot", type: "Bot" },
        created_at: "2024-01-01T00:00:00Z",
        path: "src/index.ts",
        line: 10,
      };

      expect(isHumanReviewComment(comment)).toBe(false);
    });

    it("returns false for review comments with agent marker", () => {
      const comment = {
        id: 1,
        body: `${AGENT_COMMENT_MARKER}\nAgent analysis of this line`,
        html_url: "url",
        user: { login: "humanuser", type: "User" },
        created_at: "2024-01-01T00:00:00Z",
        path: "src/index.ts",
        line: 10,
      };

      expect(isHumanReviewComment(comment)).toBe(false);
    });

    it("returns false for null user review comments", () => {
      const comment = {
        id: 1,
        body: "Some comment",
        html_url: "url",
        user: null,
        created_at: "2024-01-01T00:00:00Z",
        path: "src/index.ts",
        line: 10,
      };

      expect(isHumanReviewComment(comment)).toBe(false);
    });
  });
});
