import { cast } from "@claudekit/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/services/scanner", () => ({
  discoverRepos: vi.fn(),
}));

import { NextRequest } from "next/server";
import { discoverRepos } from "@/lib/services/scanner";
import { POST } from "./route";

const mockDiscoverRepos = vi.mocked(discoverRepos);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/discover", () => {
  it("discovers repos from roots", async () => {
    mockDiscoverRepos.mockReturnValue(
      cast([
        {
          name: "my-app",
          localPath: "/projects/my-app",
          repoType: "app",
          packageManager: "pnpm",
          isMonorepo: false,
          gitRemote: "git@github.com:user/my-app.git",
          defaultBranch: "main",
        },
      ]),
    );

    const req = new NextRequest("http://localhost/api/discover", {
      method: "POST",
      body: JSON.stringify({ roots: ["/projects"] }),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.count).toBe(1);
    expect(data.repos[0].name).toBe("my-app");
  });

  it("returns 400 when roots is missing", async () => {
    const req = new NextRequest("http://localhost/api/discover", {
      method: "POST",
      body: JSON.stringify({}),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("roots");
  });

  it("returns 400 when roots is not an array of strings", async () => {
    const req = new NextRequest("http://localhost/api/discover", {
      method: "POST",
      body: JSON.stringify({ roots: [123] }),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("roots");
  });
});
