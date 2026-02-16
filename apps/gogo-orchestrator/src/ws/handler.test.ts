import { describe, expect, it, vi } from "vitest";

// Mock the schema module
vi.mock("../schemas/index.js", () => ({
  WsClientMessageSchema: {
    safeParse: vi.fn(),
  },
}));

// We need to reset the module to clear the internal clients Map between tests
async function freshImport() {
  vi.resetModules();
  // Re-mock schemas after module reset
  vi.doMock("../schemas/index.js", () => ({
    WsClientMessageSchema: {
      safeParse: vi.fn(),
    },
  }));
  return await import("./handler.js");
}

function createMockSocket() {
  const listeners: Record<string, ((...args: unknown[]) => unknown)[]> = {};
  return {
    readyState: 1, // OPEN
    send: vi.fn(),
    on: vi.fn((event: string, handler: (...args: unknown[]) => unknown) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(handler);
    }),
    _trigger: (event: string, ...args: unknown[]) => {
      for (const handler of listeners[event] || []) {
        handler(...args);
      }
    },
    _listeners: listeners,
  };
}

describe("ws/handler", () => {
  describe("setupWebSocket", () => {
    it("should send connection:established on setup", async () => {
      const mod = await freshImport();
      const socket = createMockSocket();

      mod.setupWebSocket(socket as never);

      expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ type: "connection:established", payload: {} }));
    });

    it("should register message and close listeners", async () => {
      const mod = await freshImport();
      const socket = createMockSocket();

      mod.setupWebSocket(socket as never);

      expect(socket.on).toHaveBeenCalledWith("message", expect.any(Function));
      expect(socket.on).toHaveBeenCalledWith("close", expect.any(Function));
    });

    it("should handle subscribe messages", async () => {
      const mod = await freshImport();
      const { WsClientMessageSchema: schema } = await import("../schemas/index.js");
      const socket = createMockSocket();
      mod.setupWebSocket(socket as never);

      vi.mocked(schema.safeParse).mockReturnValue({
        success: true,
        data: {
          type: "subscribe",
          payload: { jobId: "job-123" },
        },
      } as never);

      // Trigger message handler
      socket._trigger(
        "message",
        Buffer.from(
          JSON.stringify({
            type: "subscribe",
            payload: { jobId: "job-123" },
          }),
        ),
      );

      // Should send subscribed confirmation
      expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ type: "subscribed", payload: { jobId: "job-123" } }));
    });

    it("should handle unsubscribe messages", async () => {
      const mod = await freshImport();
      const { WsClientMessageSchema: schema } = await import("../schemas/index.js");
      const socket = createMockSocket();
      mod.setupWebSocket(socket as never);

      // Subscribe first
      vi.mocked(schema.safeParse).mockReturnValue({
        success: true,
        data: { type: "subscribe", payload: { jobId: "job-123" } },
      } as never);
      socket._trigger("message", Buffer.from("{}"));

      // Then unsubscribe
      vi.mocked(schema.safeParse).mockReturnValue({
        success: true,
        data: { type: "unsubscribe", payload: { jobId: "job-123" } },
      } as never);
      socket._trigger("message", Buffer.from("{}"));

      expect(socket.send).toHaveBeenCalledWith(
        JSON.stringify({
          type: "unsubscribed",
          payload: { jobId: "job-123" },
        }),
      );
    });

    it("should handle ping messages with pong", async () => {
      const mod = await freshImport();
      const { WsClientMessageSchema: schema } = await import("../schemas/index.js");
      const socket = createMockSocket();
      mod.setupWebSocket(socket as never);

      vi.mocked(schema.safeParse).mockReturnValue({
        success: true,
        data: { type: "ping" },
      } as never);

      socket._trigger("message", Buffer.from("{}"));

      expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ type: "pong", payload: {} }));
    });

    it("should handle subscribe_repo messages", async () => {
      const mod = await freshImport();
      const { WsClientMessageSchema: schema } = await import("../schemas/index.js");
      const socket = createMockSocket();
      mod.setupWebSocket(socket as never);

      vi.mocked(schema.safeParse).mockReturnValue({
        success: true,
        data: { type: "subscribe_repo", payload: { repositoryId: "repo-1" } },
      } as never);

      socket._trigger("message", Buffer.from("{}"));

      expect(socket.send).toHaveBeenCalledWith(
        JSON.stringify({
          type: "subscribed_repo",
          payload: { repositoryId: "repo-1" },
        }),
      );
    });

    it("should handle unsubscribe_repo messages", async () => {
      const mod = await freshImport();
      const { WsClientMessageSchema: schema } = await import("../schemas/index.js");
      const socket = createMockSocket();
      mod.setupWebSocket(socket as never);

      vi.mocked(schema.safeParse).mockReturnValue({
        success: true,
        data: {
          type: "unsubscribe_repo",
          payload: { repositoryId: "repo-1" },
        },
      } as never);

      socket._trigger("message", Buffer.from("{}"));

      expect(socket.send).toHaveBeenCalledWith(
        JSON.stringify({
          type: "unsubscribed_repo",
          payload: { repositoryId: "repo-1" },
        }),
      );
    });

    it("should send error for invalid message format", async () => {
      const mod = await freshImport();
      const { WsClientMessageSchema: schema } = await import("../schemas/index.js");
      const socket = createMockSocket();
      mod.setupWebSocket(socket as never);

      vi.mocked(schema.safeParse).mockReturnValue({
        success: false,
        error: { format: () => ({ _errors: ["invalid"] }) },
      } as never);

      socket._trigger("message", Buffer.from("{}"));

      expect(socket.send).toHaveBeenCalledWith(expect.stringContaining("Invalid message format"));
    });

    it("should send error for unparseable message", async () => {
      const mod = await freshImport();
      const socket = createMockSocket();
      mod.setupWebSocket(socket as never);

      // Send invalid JSON
      socket._trigger("message", Buffer.from("not json{{{"));

      expect(socket.send).toHaveBeenCalledWith(
        JSON.stringify({
          type: "error",
          payload: { message: "Failed to parse message" },
        }),
      );
    });

    it("should remove client on close", async () => {
      const mod = await freshImport();
      const socket = createMockSocket();
      mod.setupWebSocket(socket as never);

      expect(mod.getClientCount()).toBe(1);

      socket._trigger("close");

      expect(mod.getClientCount()).toBe(0);
    });
  });

  describe("broadcast", () => {
    it("should send message to all connected clients", async () => {
      const mod = await freshImport();
      const socket1 = createMockSocket();
      const socket2 = createMockSocket();

      mod.setupWebSocket(socket1 as never);
      mod.setupWebSocket(socket2 as never);

      // Clear setup messages
      socket1.send.mockClear();
      socket2.send.mockClear();

      mod.broadcast({ type: "job:updated", payload: { id: "job-1" } });

      expect(socket1.send).toHaveBeenCalledWith(JSON.stringify({ type: "job:updated", payload: { id: "job-1" } }));
      expect(socket2.send).toHaveBeenCalledWith(JSON.stringify({ type: "job:updated", payload: { id: "job-1" } }));
    });

    it("should skip closed sockets", async () => {
      const mod = await freshImport();
      const socket1 = createMockSocket();
      const socket2 = createMockSocket();
      socket2.readyState = 3; // CLOSED

      mod.setupWebSocket(socket1 as never);
      mod.setupWebSocket(socket2 as never);

      socket1.send.mockClear();
      socket2.send.mockClear();

      mod.broadcast({ type: "job:updated", payload: {} });

      expect(socket1.send).toHaveBeenCalled();
      expect(socket2.send).not.toHaveBeenCalled();
    });
  });

  describe("broadcastToJob", () => {
    it("should only send to clients subscribed to the job", async () => {
      const mod = await freshImport();
      const { WsClientMessageSchema: schema } = await import("../schemas/index.js");

      const socket1 = createMockSocket();
      const socket2 = createMockSocket();

      mod.setupWebSocket(socket1 as never);
      mod.setupWebSocket(socket2 as never);

      // Subscribe socket1 to job-1
      vi.mocked(schema.safeParse).mockReturnValue({
        success: true,
        data: { type: "subscribe", payload: { jobId: "job-1" } },
      } as never);
      socket1._trigger("message", Buffer.from("{}"));

      socket1.send.mockClear();
      socket2.send.mockClear();

      mod.broadcastToJob("job-1", {
        type: "job:log",
        payload: { data: "test" },
      });

      expect(socket1.send).toHaveBeenCalled();
      expect(socket2.send).not.toHaveBeenCalled();
    });
  });

  describe("sendLogToSubscribers", () => {
    it("should send log entries to subscribed clients", async () => {
      const mod = await freshImport();
      const { WsClientMessageSchema: schema } = await import("../schemas/index.js");

      const socket = createMockSocket();
      mod.setupWebSocket(socket as never);

      vi.mocked(schema.safeParse).mockReturnValue({
        success: true,
        data: { type: "subscribe", payload: { jobId: "job-1" } },
      } as never);
      socket._trigger("message", Buffer.from("{}"));
      socket.send.mockClear();

      mod.sendLogToSubscribers("job-1", {
        stream: "stdout",
        content: "Hello",
        sequence: 0,
      });

      expect(socket.send).toHaveBeenCalledWith(
        JSON.stringify({
          type: "job:log",
          payload: {
            jobId: "job-1",
            stream: "stdout",
            content: "Hello",
            sequence: 0,
          },
        }),
      );
    });
  });

  describe("getClientCount", () => {
    it("should return the number of connected clients", async () => {
      const mod = await freshImport();

      expect(mod.getClientCount()).toBe(0);

      const socket1 = createMockSocket();
      mod.setupWebSocket(socket1 as never);
      expect(mod.getClientCount()).toBe(1);

      const socket2 = createMockSocket();
      mod.setupWebSocket(socket2 as never);
      expect(mod.getClientCount()).toBe(2);

      // Disconnect one
      socket1._trigger("close");
      expect(mod.getClientCount()).toBe(1);
    });
  });
});
