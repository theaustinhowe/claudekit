import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/app-settings", () => ({
  readSettings: vi.fn(),
  writeSettings: vi.fn(),
}));

vi.mock("@/lib/app-definitions", () => ({
  MANAGED_APP_IDS: ["gadget", "gogo-web", "inspector"],
}));

import { readSettings, writeSettings } from "@/lib/app-settings";
import { GET, PUT } from "./route";

const mockReadSettings = vi.mocked(readSettings);
const mockWriteSettings = vi.mocked(writeSettings);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/apps/settings", () => {
  it("returns defaults when no settings file exists", async () => {
    mockReadSettings.mockReturnValue(null);

    const response = await GET();
    const data = await response.json();

    expect(data.version).toBe(1);
    expect(data.apps.gadget).toEqual({ autoStart: false, autoRestart: true });
    expect(data.apps["gogo-web"]).toEqual({ autoStart: false, autoRestart: true });
    expect(data.apps.inspector).toEqual({ autoStart: false, autoRestart: true });
  });

  it("returns existing settings with missing apps filled in", async () => {
    mockReadSettings.mockReturnValue({
      version: 1,
      apps: {
        gadget: { autoStart: true, autoRestart: false },
      },
    });

    const response = await GET();
    const data = await response.json();

    expect(data.version).toBe(1);
    expect(data.apps.gadget).toEqual({ autoStart: true, autoRestart: false });
    expect(data.apps["gogo-web"]).toEqual({ autoStart: false, autoRestart: true });
    expect(data.apps.inspector).toEqual({ autoStart: false, autoRestart: true });
  });

  it("returns existing settings when all apps are present", async () => {
    const settings = {
      version: 1 as const,
      apps: {
        gadget: { autoStart: true, autoRestart: true },
        "gogo-web": { autoStart: false, autoRestart: false },
        inspector: { autoStart: true, autoRestart: false },
      },
    };
    mockReadSettings.mockReturnValue(settings);

    const response = await GET();
    const data = await response.json();

    expect(data.apps.gadget).toEqual({ autoStart: true, autoRestart: true });
    expect(data.apps["gogo-web"]).toEqual({ autoStart: false, autoRestart: false });
    expect(data.apps.inspector).toEqual({ autoStart: true, autoRestart: false });
  });
});

describe("PUT /api/apps/settings", () => {
  it("writes valid settings and returns ok", async () => {
    const body = {
      version: 1,
      apps: {
        gadget: { autoStart: true, autoRestart: true },
      },
    };

    const request = new Request("http://localhost:2000/api/apps/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const response = await PUT(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ ok: true });
    expect(mockWriteSettings).toHaveBeenCalledWith(body);
  });

  it("returns 400 for invalid version", async () => {
    const body = {
      version: 2,
      apps: {},
    };

    const request = new Request("http://localhost:2000/api/apps/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const response = await PUT(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid settings format");
    expect(mockWriteSettings).not.toHaveBeenCalled();
  });

  it("returns 400 when apps is not an object", async () => {
    const body = {
      version: 1,
      apps: "invalid",
    };

    const request = new Request("http://localhost:2000/api/apps/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const response = await PUT(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid settings format");
  });

  it("returns 400 for invalid JSON body", async () => {
    const request = new Request("http://localhost:2000/api/apps/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });

    const response = await PUT(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid JSON");
  });
});
