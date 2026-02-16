import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/constants/tools", () => ({
  getToolById: vi.fn(),
}));
vi.mock("@/lib/services/process-runner", () => ({
  runProcess: vi.fn(),
}));

import { getToolById } from "@/lib/constants/tools";
import { runProcess } from "@/lib/services/process-runner";
import { createToolboxCommandRunner } from "./toolbox-command";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("toolbox-command runner", () => {
  it("throws when tool not found", async () => {
    vi.mocked(getToolById).mockReturnValue(undefined as never);

    const runner = createToolboxCommandRunner({ toolId: "nonexistent", action: "install" });
    const controller = new AbortController();

    await expect(runner({ onProgress: vi.fn(), signal: controller.signal, sessionId: "s1" })).rejects.toThrow(
      "Tool not found",
    );
  });

  it("runs install command for a tool", async () => {
    vi.mocked(getToolById).mockReturnValue({
      id: "biome",
      name: "Biome",
      binary: "biome",
      installCommand: "npm install -g @biomejs/biome",
    } as never);
    vi.mocked(runProcess).mockResolvedValue({ exitCode: 0 });

    const onProgress = vi.fn();
    const controller = new AbortController();
    const runner = createToolboxCommandRunner({ toolId: "biome", action: "install" });

    const result = await runner({ onProgress, signal: controller.signal, sessionId: "s1" });

    expect(runProcess).toHaveBeenCalledWith(expect.objectContaining({ command: "npm install -g @biomejs/biome" }));
    expect(result).toEqual({ result: { exitCode: 0, toolId: "biome", action: "install" } });
  });

  it("uses homebrew when installMethod is homebrew", async () => {
    vi.mocked(getToolById).mockReturnValue({
      id: "node",
      name: "Node.js",
      binary: "node",
      installCommand: "nvm install --lts",
    } as never);
    vi.mocked(runProcess).mockResolvedValue({ exitCode: 0 });

    const runner = createToolboxCommandRunner({ toolId: "node", action: "install", installMethod: "homebrew" });
    await runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" });

    expect(runProcess).toHaveBeenCalledWith(expect.objectContaining({ command: "brew install node" }));
  });

  it("uses update command for update action", async () => {
    vi.mocked(getToolById).mockReturnValue({
      id: "biome",
      name: "Biome",
      binary: "biome",
      installCommand: "npm install -g @biomejs/biome",
      updateCommand: "npm update -g @biomejs/biome",
    } as never);
    vi.mocked(runProcess).mockResolvedValue({ exitCode: 0 });

    const runner = createToolboxCommandRunner({ toolId: "biome", action: "update" });
    await runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" });

    expect(runProcess).toHaveBeenCalledWith(expect.objectContaining({ command: "npm update -g @biomejs/biome" }));
  });

  it("falls back to install command when no update command", async () => {
    vi.mocked(getToolById).mockReturnValue({
      id: "biome",
      name: "Biome",
      binary: "biome",
      installCommand: "npm install -g @biomejs/biome",
    } as never);
    vi.mocked(runProcess).mockResolvedValue({ exitCode: 0 });

    const runner = createToolboxCommandRunner({ toolId: "biome", action: "update" });
    await runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" });

    expect(runProcess).toHaveBeenCalledWith(expect.objectContaining({ command: "npm install -g @biomejs/biome" }));
  });

  it("throws when no command available", async () => {
    vi.mocked(getToolById).mockReturnValue({
      id: "custom",
      name: "Custom",
      binary: "custom",
    } as never);

    const runner = createToolboxCommandRunner({ toolId: "custom", action: "install" });

    await expect(
      runner({ onProgress: vi.fn(), signal: new AbortController().signal, sessionId: "s1" }),
    ).rejects.toThrow("No command available");
  });
});
