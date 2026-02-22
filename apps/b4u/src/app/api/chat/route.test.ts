import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@claudekit/claude-runner", () => ({
  runClaude: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  getDb: vi.fn(async () => ({})),
  queryAll: vi.fn(),
  queryOne: vi.fn(),
}));
vi.mock("@/lib/claude/prompts/chat-response", () => ({
  buildChatResponsePrompt: vi.fn(() => "mock prompt"),
}));

import { runClaude } from "@claudekit/claude-runner";
import { POST } from "@/app/api/chat/route";
import { buildChatResponsePrompt } from "@/lib/claude/prompts/chat-response";
import { queryAll, queryOne } from "@/lib/db";

const mockRunClaude = vi.mocked(runClaude);
const mockQueryAll = vi.mocked(queryAll);
const mockQueryOne = vi.mocked(queryOne);
const mockBuildPrompt = vi.mocked(buildChatResponsePrompt);

function makeRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** Sets up mocks so POST succeeds through the happy path. */
function setupHappyPath(stdout = '{"response":"Hello!","suggestedAction":null}') {
  // First queryOne call: loadPhaseContext phase 1 -> project_summary
  // Second queryOne call: project_path lookup
  mockQueryOne
    .mockResolvedValueOnce({ name: "Test" } as never)
    .mockResolvedValueOnce({ project_path: "/project" } as never);
  mockRunClaude.mockResolvedValue({ stdout, stderr: "", exitCode: 0 } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/chat", () => {
  it("returns 400 when message is missing", async () => {
    const response = await POST(makeRequest({ phase: 1 }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("message and phase are required");
  });

  it("returns 400 when phase is missing", async () => {
    const response = await POST(makeRequest({ message: "hello" }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("message and phase are required");
  });

  it("phase 1: calls queryOne for project_summary", async () => {
    setupHappyPath();

    await POST(makeRequest({ message: "hello", phase: 1 }));

    // First call: loadPhaseContext -> queryOne for project_summary
    expect(mockQueryOne).toHaveBeenCalledWith({}, "SELECT * FROM project_summary LIMIT 1");
    expect(mockBuildPrompt).toHaveBeenCalledWith("hello", 1, { summary: { name: "Test" } });
  });

  it("phase 2: calls queryAll for routes and flows", async () => {
    const mockRoutes = [{ path: "/home", title: "Home" }];
    const mockFlows = [{ name: "Login" }];
    mockQueryAll.mockResolvedValueOnce(mockRoutes as never).mockResolvedValueOnce(mockFlows as never);
    mockQueryOne.mockResolvedValueOnce({ project_path: "/project" } as never);
    mockRunClaude.mockResolvedValue({
      stdout: '{"response":"OK","suggestedAction":null}',
      stderr: "",
      exitCode: 0,
    } as never);

    await POST(makeRequest({ message: "show routes", phase: 2 }));

    expect(mockQueryAll).toHaveBeenCalledWith({}, "SELECT path, title FROM routes ORDER BY id");
    expect(mockQueryAll).toHaveBeenCalledWith({}, "SELECT name FROM user_flows ORDER BY id");
    expect(mockBuildPrompt).toHaveBeenCalledWith("show routes", 2, {
      routes: mockRoutes,
      flows: mockFlows,
    });
  });

  it("phase 3: calls queryAll for entities and auth overrides", async () => {
    const mockEntities = [{ name: "User", count: 5 }];
    const mockAuth = [{ label: "Admin", enabled: true }];
    mockQueryAll.mockResolvedValueOnce(mockEntities as never).mockResolvedValueOnce(mockAuth as never);
    mockQueryOne.mockResolvedValueOnce({ project_path: "/project" } as never);
    mockRunClaude.mockResolvedValue({
      stdout: '{"response":"OK","suggestedAction":null}',
      stderr: "",
      exitCode: 0,
    } as never);

    await POST(makeRequest({ message: "data plan", phase: 3 }));

    expect(mockQueryAll).toHaveBeenCalledWith({}, "SELECT name, count FROM mock_data_entities");
    expect(mockQueryAll).toHaveBeenCalledWith({}, "SELECT label, enabled FROM auth_overrides");
    expect(mockBuildPrompt).toHaveBeenCalledWith("data plan", 3, {
      entities: mockEntities,
      authOverrides: mockAuth,
    });
  });

  it("phase 4: calls queryAll for scripts and step count", async () => {
    const mockScripts = [{ flow_name: "Login Flow" }];
    const mockSteps = [{ total: 12 }];
    mockQueryAll.mockResolvedValueOnce(mockScripts as never).mockResolvedValueOnce(mockSteps as never);
    mockQueryOne.mockResolvedValueOnce({ project_path: "/project" } as never);
    mockRunClaude.mockResolvedValue({
      stdout: '{"response":"OK","suggestedAction":null}',
      stderr: "",
      exitCode: 0,
    } as never);

    await POST(makeRequest({ message: "scripts", phase: 4 }));

    expect(mockQueryAll).toHaveBeenCalledWith({}, "SELECT flow_name FROM flow_scripts");
    expect(mockQueryAll).toHaveBeenCalledWith({}, "SELECT COUNT(*) as total FROM script_steps");
    expect(mockBuildPrompt).toHaveBeenCalledWith("scripts", 4, {
      scripts: mockScripts,
      totalSteps: 12,
    });
  });

  it("parses JSON from Claude stdout and returns parsed response", async () => {
    setupHappyPath('Some preamble text {"response":"Great question!","suggestedAction":"help"} trailing');

    const response = await POST(makeRequest({ message: "help me", phase: 1 }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.response).toBe("Great question!");
    expect(data.suggestedAction).toBe("help");
  });

  it("falls back to raw text when Claude returns malformed JSON", async () => {
    const longText = "A".repeat(600);
    setupHappyPath(longText);

    const response = await POST(makeRequest({ message: "hello", phase: 1 }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.response).toHaveLength(500);
    expect(data.response).toBe(longText.slice(0, 500));
    expect(data.suggestedAction).toBeNull();
  });

  it("returns 200 with error message when database/Claude throws", async () => {
    mockQueryOne.mockRejectedValue(new Error("DB connection failed"));

    const response = await POST(makeRequest({ message: "hello", phase: 1 }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.response).toContain("I encountered an issue");
    expect(data.suggestedAction).toBeNull();
  });
});
