import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchMcpServerList, getCuratedMcpServers, mcpListEntriesToConcepts } from "./mcp-list-scanner";

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("mcp-list-scanner", () => {
  describe("getCuratedMcpServers", () => {
    it("returns non-empty array of server entries", () => {
      const servers = getCuratedMcpServers();

      expect(servers.length).toBeGreaterThan(0);
    });

    it("every entry has required fields", () => {
      const servers = getCuratedMcpServers();

      for (const server of servers) {
        expect(server).toHaveProperty("name");
        expect(server).toHaveProperty("description");
        expect(server).toHaveProperty("command");
        expect(server).toHaveProperty("args");
        expect(server).toHaveProperty("tags");
        expect(server.tags.length).toBeGreaterThan(0);
      }
    });

    it("includes well-known servers", () => {
      const servers = getCuratedMcpServers();
      const names = servers.map((s) => s.name);

      expect(names).toContain("filesystem");
      expect(names).toContain("github");
      expect(names).toContain("postgres");
    });
  });

  describe("fetchMcpServerList", () => {
    it("fetches and returns server list", async () => {
      const mockData = { servers: [{ name: "test-server", command: "npx" }] };
      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockData,
      } as Response);

      const result = await fetchMcpServerList("https://example.com/servers.json");

      expect(result.servers).toHaveLength(1);
      expect(result.servers[0].name).toBe("test-server");
    });

    it("throws on HTTP error", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: false,
        status: 500,
      } as Response);

      await expect(fetchMcpServerList("https://example.com/fail")).rejects.toThrow("Failed to fetch MCP list: 500");
    });

    it("throws on invalid format", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ invalid: true }),
      } as Response);

      await expect(fetchMcpServerList("https://example.com/bad")).rejects.toThrow("Invalid MCP server list format");
    });
  });

  describe("mcpListEntriesToConcepts", () => {
    it("converts entries to DiscoveredConcepts", () => {
      const entries = [
        {
          name: "test-server",
          description: "A test server",
          command: "npx",
          args: ["-y", "test-pkg"],
          tags: ["test"],
        },
      ];

      const concepts = mcpListEntriesToConcepts(entries);

      expect(concepts).toHaveLength(1);
      expect(concepts[0].concept_type).toBe("mcp_server");
      expect(concepts[0].name).toBe("test-server");
      expect(concepts[0].description).toBe("A test server");
      expect(concepts[0].relative_path).toBe(".mcp.json#test-server");
      expect(concepts[0].metadata.tags).toEqual(["test"]);
    });

    it("uses default description when none provided", () => {
      const entries = [{ name: "no-desc", command: "npx", args: [], tags: [] }];

      const concepts = mcpListEntriesToConcepts(entries as never);

      expect(concepts[0].description).toBe("MCP Server: no-desc");
    });

    it("includes env and url in config when present", () => {
      const entries = [
        {
          name: "with-env",
          description: "Has env",
          command: "npx",
          args: [],
          env: { API_KEY: "" },
          url: "https://example.com",
          tags: [],
        },
      ];

      const concepts = mcpListEntriesToConcepts(entries);
      const content = concepts[0].content ?? "";
      const config = JSON.parse(content);

      expect(config["with-env"]).toHaveProperty("env");
      expect(config["with-env"]).toHaveProperty("url");
    });
  });
});
