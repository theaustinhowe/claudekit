import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(() => []),
  statSync: vi.fn(),
  unlinkSync: vi.fn(),
  createWriteStream: vi.fn(() => ({
    write: vi.fn((_chunk: unknown, cb: () => void) => cb()),
    end: vi.fn((cb?: () => void) => cb?.()),
  })),
}));

import { createLogger, createServiceLogger } from "./index";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createLogger", () => {
  it("returns a pino logger instance", () => {
    const logger = createLogger({ app: "gadget", fileLogging: false, pretty: false });

    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.error).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.debug).toBe("function");
  });

  it("sets the app in base context", () => {
    const logger = createLogger({ app: "web", fileLogging: false, pretty: false });

    // Pino loggers have bindings that include the base
    const bindings = logger.bindings();
    expect(bindings.app).toBe("web");
  });

  it("respects custom log level", () => {
    const logger = createLogger({ app: "gadget", level: "debug", fileLogging: false, pretty: false });

    expect(logger.level).toBe("debug");
  });

  it("creates logger with file logging enabled", () => {
    const logger = createLogger({ app: "b4u", logDir: "/tmp/test-logs", pretty: false });

    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe("function");
  });
});

describe("createServiceLogger", () => {
  it("creates a child logger with service binding", () => {
    const parent = createLogger({ app: "gadget", fileLogging: false, pretty: false });
    const child = createServiceLogger(parent, "scanner");

    const bindings = child.bindings();
    expect(bindings.service).toBe("scanner");
    expect(bindings.app).toBe("gadget");
  });

  it("inherits parent log level", () => {
    const parent = createLogger({ app: "gadget", level: "warn", fileLogging: false, pretty: false });
    const child = createServiceLogger(parent, "auditor");

    expect(child.level).toBe("warn");
  });
});
