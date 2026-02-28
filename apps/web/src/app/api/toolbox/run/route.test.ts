import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/services/process-runner", () => ({
  runCommand: vi.fn(),
}));

vi.mock("@/lib/constants/tools", () => ({
  getToolById: vi.fn((id: string) => {
    const map: Record<string, Record<string, unknown>> = {
      node: {
        id: "node",
        name: "Node.js",
        installCommand: "brew install node",
        updateCommands: { homebrew: "brew upgrade node", default: "brew upgrade node" },
      },
      claude: {
        id: "claude",
        name: "Claude Code",
        installCommand: "npm install -g @anthropic-ai/claude-code",
        updateCommands: {
          homebrew: "brew upgrade claude-code",
          npm: "npm update -g @anthropic-ai/claude-code",
          default: "npm update -g @anthropic-ai/claude-code",
        },
        brewPackage: "claude-code",
      },
      npx: {
        id: "npx",
        name: "npx",
        updateCommands: { default: "npm install -g npm@latest" },
      },
    };
    return map[id];
  }),
  resolveUpdateCommand: vi.fn((tool: Record<string, unknown>, installMethod: string | null) => {
    const cmds = tool.updateCommands as Record<string, string> | undefined;
    if (cmds) {
      if (installMethod && installMethod in cmds) return cmds[installMethod];
      if (cmds.default) return cmds.default;
    }
    return (tool as Record<string, unknown>).installCommand as string | undefined;
  }),
}));

import { runCommand } from "@/lib/services/process-runner";
import { POST } from "./route";

const mockRunCommand = vi.mocked(runCommand);

beforeEach(() => {
  vi.clearAllMocks();
  mockRunCommand.mockReturnValue(new ReadableStream());
});

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/toolbox/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as NextRequest;
}

describe("POST /api/toolbox/run", () => {
  it("runs install command", async () => {
    const response = await POST(makeRequest({ toolId: "node", action: "install" }));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
    expect(mockRunCommand).toHaveBeenCalledWith("brew install node");
  });

  it("runs update command with homebrew install method", async () => {
    const response = await POST(makeRequest({ toolId: "claude", action: "update", installMethod: "homebrew" }));

    expect(response.status).toBe(200);
    expect(mockRunCommand).toHaveBeenCalledWith("brew upgrade claude-code");
  });

  it("runs default update command when no installMethod", async () => {
    const response = await POST(makeRequest({ toolId: "node", action: "update" }));

    expect(response.status).toBe(200);
    expect(mockRunCommand).toHaveBeenCalledWith("brew upgrade node");
  });

  it("runs update for npm install method", async () => {
    const response = await POST(makeRequest({ toolId: "claude", action: "update", installMethod: "npm" }));

    expect(response.status).toBe(200);
    expect(mockRunCommand).toHaveBeenCalledWith("npm update -g @anthropic-ai/claude-code");
  });

  it("returns 400 when toolId is missing", async () => {
    const response = await POST(makeRequest({ action: "install" }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("toolId and action are required");
  });

  it("returns 400 when action is missing", async () => {
    const response = await POST(makeRequest({ toolId: "node" }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("toolId and action are required");
  });

  it("returns 404 for unknown tool", async () => {
    const response = await POST(makeRequest({ toolId: "unknown", action: "install" }));
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Tool not found");
  });

  it("returns 400 when no install command available", async () => {
    const response = await POST(makeRequest({ toolId: "npx", action: "install" }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("No command available for this tool");
  });
});
