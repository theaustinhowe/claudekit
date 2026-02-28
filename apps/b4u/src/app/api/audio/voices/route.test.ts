import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/audio/elevenlabs-client", () => ({
  listVoices: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  getDb: vi.fn().mockResolvedValue({}),
  queryAll: vi.fn(),
}));

import { cast } from "@claudekit/test-utils";
import { GET } from "@/app/api/audio/voices/route";
import { listVoices } from "@/lib/audio/elevenlabs-client";
import { queryAll } from "@/lib/db";

const mockListVoices = vi.mocked(listVoices);
const mockQueryAll = vi.mocked(queryAll);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/audio/voices", () => {
  it("returns voices from ElevenLabs API", async () => {
    mockListVoices.mockResolvedValue(
      cast([
        { voice_id: "v1", name: "Rachel", labels: { accent: "American" }, category: "premade" },
        { voice_id: "v2", name: "Drew", labels: { description: "Warm" }, category: "premade" },
      ]),
    );

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toHaveLength(2);
    expect(data[0]).toEqual({ id: "v1", name: "Rachel", style: "American" });
    expect(data[1]).toEqual({ id: "v2", name: "Drew", style: "Warm" });
  });

  it("falls back to DB when API fails", async () => {
    mockListVoices.mockRejectedValue(new Error("API unavailable"));
    mockQueryAll.mockResolvedValue(cast([{ id: "db-v1", name: "Fallback Voice" }]));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toHaveLength(1);
    expect(data[0].name).toBe("Fallback Voice");
  });
});
