import { describe, expect, it } from "vitest";
import {
  AUTH_OVERRIDES,
  CHAPTER_MARKERS,
  ENV_ITEMS,
  FILE_TREE,
  FLOW_SCRIPTS,
  MOCK_DATA_ENTITIES,
  PROJECT_SUMMARY,
  ROUTES,
  TIMELINE_MARKERS,
  USER_FLOWS,
  VOICE_OPTIONS,
  VOICEOVER_SCRIPTS,
} from "@/lib/mock-data";

describe("PROJECT_SUMMARY", () => {
  it("has all required fields", () => {
    expect(PROJECT_SUMMARY.name).toBeTruthy();
    expect(PROJECT_SUMMARY.framework).toBeTruthy();
    expect(PROJECT_SUMMARY.directories).toBeInstanceOf(Array);
    expect(PROJECT_SUMMARY.directories.length).toBeGreaterThan(0);
    expect(PROJECT_SUMMARY.auth).toBeTruthy();
    expect(PROJECT_SUMMARY.database).toBeTruthy();
  });
});

describe("FILE_TREE", () => {
  it("is a root directory node", () => {
    expect(FILE_TREE.type).toBe("directory");
    expect(FILE_TREE.name).toBeTruthy();
  });

  it("has children", () => {
    expect(FILE_TREE.children).toBeDefined();
    expect(FILE_TREE.children?.length).toBeGreaterThan(0);
  });

  it("contains file and directory nodes", () => {
    const types = new Set(FILE_TREE.children?.map((c) => c.type));
    expect(types.has("directory")).toBe(true);
    expect(types.has("file")).toBe(true);
  });
});

describe("ROUTES", () => {
  it("is a non-empty array", () => {
    expect(ROUTES.length).toBeGreaterThan(0);
  });

  it("each route has required fields", () => {
    for (const route of ROUTES) {
      expect(route.path).toMatch(/^\//);
      expect(route.title).toBeTruthy();
      expect(typeof route.authRequired).toBe("boolean");
      expect(typeof route.description).toBe("string");
    }
  });

  it("includes both auth and non-auth routes", () => {
    const authRequired = ROUTES.filter((r) => r.authRequired);
    const noAuth = ROUTES.filter((r) => !r.authRequired);
    expect(authRequired.length).toBeGreaterThan(0);
    expect(noAuth.length).toBeGreaterThan(0);
  });
});

describe("USER_FLOWS", () => {
  it("is a non-empty array", () => {
    expect(USER_FLOWS.length).toBeGreaterThan(0);
  });

  it("each flow has id, name, and steps", () => {
    for (const flow of USER_FLOWS) {
      expect(flow.id).toBeTruthy();
      expect(flow.name).toBeTruthy();
      expect(flow.steps.length).toBeGreaterThan(0);
    }
  });

  it("flow IDs are unique", () => {
    const ids = USER_FLOWS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("MOCK_DATA_ENTITIES", () => {
  it("each entity has name, count, and note", () => {
    for (const entity of MOCK_DATA_ENTITIES) {
      expect(entity.name).toBeTruthy();
      expect(entity.count).toBeGreaterThan(0);
      expect(entity.note).toBeTruthy();
    }
  });
});

describe("AUTH_OVERRIDES", () => {
  it("each override has id, label, and enabled", () => {
    for (const override of AUTH_OVERRIDES) {
      expect(override.id).toBeTruthy();
      expect(override.label).toBeTruthy();
      expect(typeof override.enabled).toBe("boolean");
    }
  });

  it("IDs are unique", () => {
    const ids = AUTH_OVERRIDES.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("ENV_ITEMS", () => {
  it("each item has id, label, and enabled", () => {
    for (const item of ENV_ITEMS) {
      expect(item.id).toBeTruthy();
      expect(item.label).toBeTruthy();
      expect(typeof item.enabled).toBe("boolean");
    }
  });

  it("IDs are unique", () => {
    const ids = ENV_ITEMS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("FLOW_SCRIPTS", () => {
  it("each script references a known flow", () => {
    const flowIds = new Set(USER_FLOWS.map((f) => f.id));
    for (const script of FLOW_SCRIPTS) {
      expect(flowIds.has(script.flowId)).toBe(true);
    }
  });

  it("each script has ordered steps", () => {
    for (const script of FLOW_SCRIPTS) {
      expect(script.steps.length).toBeGreaterThan(0);
      for (let i = 0; i < script.steps.length; i++) {
        expect(script.steps[i].stepNumber).toBe(i + 1);
      }
    }
  });

  it("step IDs are unique within each script", () => {
    for (const script of FLOW_SCRIPTS) {
      const ids = script.steps.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe("VOICEOVER_SCRIPTS", () => {
  it("has entries for each flow", () => {
    const flowIds = USER_FLOWS.map((f) => f.id);
    for (const id of flowIds) {
      expect(VOICEOVER_SCRIPTS[id]).toBeDefined();
      expect(VOICEOVER_SCRIPTS[id].length).toBeGreaterThan(0);
    }
  });

  it("each paragraph is a non-empty string", () => {
    for (const paragraphs of Object.values(VOICEOVER_SCRIPTS)) {
      for (const p of paragraphs) {
        expect(typeof p).toBe("string");
        expect(p.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("VOICE_OPTIONS", () => {
  it("has at least one option", () => {
    expect(VOICE_OPTIONS.length).toBeGreaterThan(0);
  });

  it("each option has id, name, and style", () => {
    for (const voice of VOICE_OPTIONS) {
      expect(voice.id).toBeTruthy();
      expect(voice.name).toBeTruthy();
      expect(voice.style).toBeTruthy();
    }
  });
});

describe("TIMELINE_MARKERS", () => {
  it("has markers for each flow", () => {
    const flowIds = USER_FLOWS.map((f) => f.id);
    for (const id of flowIds) {
      expect(TIMELINE_MARKERS[id]).toBeDefined();
      expect(TIMELINE_MARKERS[id].length).toBeGreaterThan(0);
    }
  });

  it("each marker has timestamp, label, and paragraphIndex", () => {
    for (const markers of Object.values(TIMELINE_MARKERS)) {
      for (const marker of markers) {
        expect(marker.timestamp).toMatch(/^\d+:\d{2}$/);
        expect(marker.label).toBeTruthy();
        expect(typeof marker.paragraphIndex).toBe("number");
      }
    }
  });
});

describe("CHAPTER_MARKERS", () => {
  it("has at least one marker", () => {
    expect(CHAPTER_MARKERS.length).toBeGreaterThan(0);
  });

  it("each marker has flowName and startTime", () => {
    for (const marker of CHAPTER_MARKERS) {
      expect(marker.flowName).toBeTruthy();
      expect(marker.startTime).toMatch(/^\d+:\d{2}$/);
    }
  });

  it("first chapter starts at 0:00", () => {
    expect(CHAPTER_MARKERS[0].startTime).toBe("0:00");
  });
});
