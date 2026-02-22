import os from "node:os";
import type { NetworkInfo } from "@claudekit/gogo-shared";
import type { FastifyPluginAsync } from "fastify";

// Get the configured ports
const HTTP_PORT = Number.parseInt(process.env.PORT || "2201", 10);
const WS_PORT = HTTP_PORT; // WebSocket runs on same port

export const systemRouter: FastifyPluginAsync = async (fastify) => {
  // GET /api/system/network-info - Returns local network IPs and ports for device connection
  fastify.get("/network-info", async () => {
    const interfaces = os.networkInterfaces();
    const ips: string[] = [];

    // Filter for IPv4, non-internal addresses
    for (const [, addresses] of Object.entries(interfaces)) {
      if (!addresses) continue;
      for (const addr of addresses) {
        // Skip internal (loopback) addresses and IPv6
        if (!addr.internal && addr.family === "IPv4") {
          ips.push(addr.address);
        }
      }
    }

    const networkInfo: NetworkInfo = {
      ips,
      port: HTTP_PORT,
      wsPort: WS_PORT,
    };

    return { data: networkInfo };
  });
};
