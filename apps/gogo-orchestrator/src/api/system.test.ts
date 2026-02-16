import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:os", () => ({
  default: {
    networkInterfaces: vi.fn(),
  },
}));

import os from "node:os";

interface RouteHandler {
  method: string;
  path: string;
  handler: (request: unknown, reply: unknown) => Promise<unknown>;
}

function createMockFastify() {
  const routes: RouteHandler[] = [];
  const createRegistrar = (method: string) => (path: string, handler: (r: unknown, p: unknown) => Promise<unknown>) => {
    routes.push({ method, path, handler });
  };
  return {
    routes,
    instance: { get: createRegistrar("GET"), post: createRegistrar("POST") },
  };
}

describe("system API", () => {
  let routes: RouteHandler[];
  let getHandler: (path: string) => (req: unknown, rep: unknown) => Promise<unknown>;

  beforeEach(async () => {
    vi.clearAllMocks();

    const { systemRouter } = await import("./system.js");
    const mock = createMockFastify();
    routes = mock.routes;
    await systemRouter(mock.instance as never, {} as never);

    getHandler = (path: string) => {
      const route = routes.find((r) => r.path === path);
      if (!route) throw new Error(`No route found for path: ${path}`);
      return route.handler;
    };
  });

  describe("GET /network-info", () => {
    it("should return local network IPs and ports", async () => {
      vi.mocked(os.networkInterfaces).mockReturnValue({
        en0: [
          { address: "192.168.1.100", family: "IPv4", internal: false } as never,
          { address: "fe80::1", family: "IPv6", internal: false } as never,
        ],
        lo0: [{ address: "127.0.0.1", family: "IPv4", internal: true } as never],
      });

      const handler = getHandler("/network-info");
      const result = (await handler({}, {})) as { data: { ips: string[]; port: number } };

      expect(result.data.ips).toContain("192.168.1.100");
      expect(result.data.ips).not.toContain("127.0.0.1"); // No loopback
      expect(result.data.ips).not.toContain("fe80::1"); // No IPv6
      expect(result.data.port).toBe(2201);
    });
  });
});
