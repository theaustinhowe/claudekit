import { describe, expect, it } from "vitest";
import {
  ANALYTICS_OPTIONS,
  APP_NAME,
  APP_TYPES,
  AUTH_OPTIONS,
  BACKEND_OPTIONS,
  CONSTRAINT_OPTIONS,
  DESIGN_VIBES,
  EMAIL_OPTIONS,
  FEATURE_OPTIONS,
  getAppTypeForPlatform,
  getAuthForAppType,
  getBackendsForAppType,
  getConstraintsForAppType,
  getEffectivePreviewStrategy,
  getExamplesForAppType,
  getFeatureCategoriesForAppType,
  getPlatformsForAppType,
  IMAGE_EXTENSIONS,
  IMAGE_MIME_TYPES,
  PAYMENT_OPTIONS,
  PLATFORM_ADVANCED_OPTIONS,
  PLATFORM_NEXT_STEPS,
  PLATFORM_PREVIEW_STRATEGY,
  PLATFORM_RUN_INSTRUCTIONS,
  PLATFORMS,
  PLATFORMS_WITH_DEV_SERVER,
  SERVICE_NEXT_STEPS,
  SESSION_EVENT_BUFFER_SIZE,
  SESSION_HEARTBEAT_INTERVAL_MS,
  SESSION_LOG_FLUSH_INTERVAL_MS,
  SESSION_TYPE_LABELS,
  TS_ONLY_CONSTRAINTS,
} from "./constants";

describe("APP_NAME", () => {
  it("is Inside", () => {
    expect(APP_NAME).toBe("Inside");
  });
});

describe("PLATFORMS", () => {
  it("has 12 platforms", () => {
    expect(PLATFORMS).toHaveLength(12);
  });

  it("each platform has id, label, description", () => {
    for (const p of PLATFORMS) {
      expect(p.id).toBeTruthy();
      expect(p.label).toBeTruthy();
      expect(p.description).toBeTruthy();
    }
  });

  it("includes nextjs and tanstack-start", () => {
    expect(PLATFORMS.find((p) => p.id === "nextjs")).toBeDefined();
    expect(PLATFORMS.find((p) => p.id === "tanstack-start")).toBeDefined();
  });

  it("does not include monorepo as a standalone platform", () => {
    const ids = PLATFORMS.map((p) => p.id) as string[];
    expect(ids).not.toContain("monorepo");
  });

  it("includes new mobile, game, and tool platforms", () => {
    const ids = PLATFORMS.map((p) => p.id) as string[];
    expect(ids).toContain("react-native");
    expect(ids).toContain("expo");
    expect(ids).toContain("flutter");
    expect(ids).toContain("godot");
    expect(ids).toContain("bevy");
    expect(ids).toContain("pygame");
  });
});

describe("PLATFORM_ADVANCED_OPTIONS", () => {
  it("has options for all platforms", () => {
    for (const p of PLATFORMS) {
      expect(PLATFORM_ADVANCED_OPTIONS[p.id]).toBeDefined();
      expect(PLATFORM_ADVANCED_OPTIONS[p.id].length).toBeGreaterThan(0);
    }
  });

  it("nextjs has version, router, and monorepo options", () => {
    const keys = PLATFORM_ADVANCED_OPTIONS.nextjs.map((co) => co.option.key);
    expect(keys).toContain("nextjs-version");
    expect(keys).toContain("nextjs-router");
    expect(keys).toContain("monorepo");
  });

  it("node-api has framework option", () => {
    const keys = PLATFORM_ADVANCED_OPTIONS["node-api"].map((co) => co.option.key);
    expect(keys).toContain("node-framework");
  });

  it("cli has language option", () => {
    const keys = PLATFORM_ADVANCED_OPTIONS.cli.map((co) => co.option.key);
    expect(keys).toContain("cli-language");
  });

  it("tanstack-start has libraries multi-select", () => {
    const libs = PLATFORM_ADVANCED_OPTIONS["tanstack-start"].find((co) => co.option.key === "tanstack-libraries");
    expect(libs).toBeDefined();
    expect(libs?.option.type).toBe("multi-select");
  });
});

describe("TS_ONLY_CONSTRAINTS", () => {
  it("contains expected constraint ids", () => {
    expect(TS_ONLY_CONSTRAINTS.has("typescript-strict")).toBe(true);
    expect(TS_ONLY_CONSTRAINTS.has("biome")).toBe(true);
    expect(TS_ONLY_CONSTRAINTS.has("ai-files")).toBe(false);
  });
});

describe("CONSTRAINT_OPTIONS", () => {
  it("has 6 constraints", () => {
    expect(CONSTRAINT_OPTIONS).toHaveLength(6);
  });

  it("each constraint has id, label, defaultOn", () => {
    for (const c of CONSTRAINT_OPTIONS) {
      expect(c.id).toBeTruthy();
      expect(c.label).toBeTruthy();
      expect(typeof c.defaultOn).toBe("boolean");
    }
  });
});

describe("DESIGN_VIBES", () => {
  it("has 8 vibes", () => {
    expect(DESIGN_VIBES).toHaveLength(8);
  });

  it("each vibe has id, label, description", () => {
    for (const v of DESIGN_VIBES) {
      expect(v.id).toBeTruthy();
      expect(v.label).toBeTruthy();
      expect(v.description).toBeTruthy();
    }
  });
});

describe("BACKEND_OPTIONS", () => {
  it("has 7 options", () => {
    expect(BACKEND_OPTIONS).toHaveLength(7);
  });

  it("each has id and label", () => {
    for (const b of BACKEND_OPTIONS) {
      expect(b.id).toBeTruthy();
      expect(b.label).toBeTruthy();
    }
  });
});

describe("AUTH_OPTIONS", () => {
  it("has 4 options", () => {
    expect(AUTH_OPTIONS).toHaveLength(4);
  });
});

describe("FEATURE_OPTIONS", () => {
  it("has 36 options (flattened from FEATURE_CATEGORIES)", () => {
    expect(FEATURE_OPTIONS).toHaveLength(36);
  });
});

describe("EMAIL_OPTIONS", () => {
  it("has 3 options", () => {
    expect(EMAIL_OPTIONS).toHaveLength(3);
  });
});

describe("ANALYTICS_OPTIONS", () => {
  it("has 3 options", () => {
    expect(ANALYTICS_OPTIONS).toHaveLength(3);
  });
});

describe("PAYMENT_OPTIONS", () => {
  it("has 2 options", () => {
    expect(PAYMENT_OPTIONS).toHaveLength(2);
  });
});

describe("SERVICE_NEXT_STEPS", () => {
  it("has entries for known services", () => {
    expect(SERVICE_NEXT_STEPS["supabase-db"]).toBeDefined();
    expect(SERVICE_NEXT_STEPS.stripe).toBeDefined();
    expect(SERVICE_NEXT_STEPS.clerk).toBeDefined();
  });

  it("each entry has label, description, url", () => {
    for (const [, step] of Object.entries(SERVICE_NEXT_STEPS)) {
      expect(step.label).toBeTruthy();
      expect(step.description).toBeTruthy();
      expect(step.url).toBeTruthy();
    }
  });
});

describe("PLATFORM_NEXT_STEPS", () => {
  it("has entries for nextjs, react-spa, node-api", () => {
    expect(PLATFORM_NEXT_STEPS.nextjs).toBeDefined();
    expect(PLATFORM_NEXT_STEPS["react-spa"]).toBeDefined();
    expect(PLATFORM_NEXT_STEPS["node-api"]).toBeDefined();
  });

  it("has entries for new platforms", () => {
    expect(PLATFORM_NEXT_STEPS["react-native"]).toBeDefined();
    expect(PLATFORM_NEXT_STEPS.expo).toBeDefined();
    expect(PLATFORM_NEXT_STEPS.flutter).toBeDefined();
    expect(PLATFORM_NEXT_STEPS.godot).toBeDefined();
    expect(PLATFORM_NEXT_STEPS.bevy).toBeDefined();
    expect(PLATFORM_NEXT_STEPS.pygame).toBeDefined();
  });
});

describe("IMAGE_MIME_TYPES", () => {
  it("maps common extensions to mime types", () => {
    expect(IMAGE_MIME_TYPES[".png"]).toBe("image/png");
    expect(IMAGE_MIME_TYPES[".jpg"]).toBe("image/jpeg");
    expect(IMAGE_MIME_TYPES[".svg"]).toBe("image/svg+xml");
  });
});

describe("IMAGE_EXTENSIONS", () => {
  it("is a Set of all IMAGE_MIME_TYPES keys", () => {
    expect(IMAGE_EXTENSIONS).toBeInstanceOf(Set);
    expect(IMAGE_EXTENSIONS.has(".png")).toBe(true);
    expect(IMAGE_EXTENSIONS.has(".jpg")).toBe(true);
    expect(IMAGE_EXTENSIONS.has(".svg")).toBe(true);
    expect(IMAGE_EXTENSIONS.has(".ts")).toBe(false);
  });
});

describe("session constants", () => {
  it("SESSION_EVENT_BUFFER_SIZE is 500", () => {
    expect(SESSION_EVENT_BUFFER_SIZE).toBe(500);
  });

  it("SESSION_LOG_FLUSH_INTERVAL_MS is 2000", () => {
    expect(SESSION_LOG_FLUSH_INTERVAL_MS).toBe(2000);
  });

  it("SESSION_HEARTBEAT_INTERVAL_MS is 15000", () => {
    expect(SESSION_HEARTBEAT_INTERVAL_MS).toBe(15000);
  });
});

describe("SESSION_TYPE_LABELS", () => {
  it("has labels for all session types", () => {
    expect(SESSION_TYPE_LABELS.scaffold).toBe("Scaffold");
    expect(SESSION_TYPE_LABELS.upgrade).toBe("Upgrade");
    expect(SESSION_TYPE_LABELS.auto_fix).toBe("Auto Fix");
    expect(SESSION_TYPE_LABELS.upgrade_init).toBe("Upgrade Init");
    expect(SESSION_TYPE_LABELS.chat).toBe("Chat");
  });
});

describe("APP_TYPES", () => {
  it("has 5 app types", () => {
    expect(APP_TYPES).toHaveLength(5);
  });

  it("each app type has required fields", () => {
    for (const t of APP_TYPES) {
      expect(t.id).toBeTruthy();
      expect(t.label).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(t.icon).toBeTruthy();
      expect(t.platforms.length).toBeGreaterThan(0);
      expect(t.examples.length).toBeGreaterThan(0);
    }
  });

  it("includes web, mobile, desktop, game, tool", () => {
    const ids = APP_TYPES.map((t) => t.id);
    expect(ids).toEqual(["web", "mobile", "desktop", "game", "tool"]);
  });

  it("every platform is covered by exactly one app type", () => {
    const covered = new Set<string>();
    for (const t of APP_TYPES) {
      for (const p of t.platforms) {
        expect(covered.has(p)).toBe(false);
        covered.add(p);
      }
    }
    for (const p of PLATFORMS) {
      expect(covered.has(p.id)).toBe(true);
    }
  });
});

describe("getAppTypeForPlatform", () => {
  it("returns web for nextjs", () => {
    expect(getAppTypeForPlatform("nextjs")).toBe("web");
  });

  it("returns mobile for expo", () => {
    expect(getAppTypeForPlatform("expo")).toBe("mobile");
  });

  it("returns desktop for desktop-app", () => {
    expect(getAppTypeForPlatform("desktop-app")).toBe("desktop");
  });

  it("returns game for godot", () => {
    expect(getAppTypeForPlatform("godot")).toBe("game");
  });

  it("returns tool for cli", () => {
    expect(getAppTypeForPlatform("cli")).toBe("tool");
  });

  it("returns web for unknown platform", () => {
    expect(getAppTypeForPlatform("unknown")).toBe("web");
  });
});

describe("getPlatformsForAppType", () => {
  it("returns web platforms", () => {
    const platforms = getPlatformsForAppType("web");
    expect(platforms.map((p) => p.id)).toEqual(["nextjs", "tanstack-start", "react-spa", "node-api"]);
  });

  it("returns mobile platforms", () => {
    const platforms = getPlatformsForAppType("mobile");
    expect(platforms.map((p) => p.id)).toEqual(["react-native", "expo", "flutter"]);
  });

  it("returns game platforms", () => {
    const platforms = getPlatformsForAppType("game");
    expect(platforms.map((p) => p.id)).toEqual(["godot", "bevy", "pygame"]);
  });
});

describe("getExamplesForAppType", () => {
  it("returns 4 examples per type", () => {
    for (const t of APP_TYPES) {
      const examples = getExamplesForAppType(t.id);
      expect(examples).toHaveLength(4);
      for (const e of examples) {
        expect(e.prompt).toBeTruthy();
        expect(e.title).toBeTruthy();
      }
    }
  });
});

describe("getBackendsForAppType", () => {
  it("returns filtered backends for web", () => {
    const backends = getBackendsForAppType("web");
    expect(backends.length).toBeGreaterThan(0);
    expect(backends.map((b) => b.id)).toContain("supabase-db");
  });

  it("returns filtered backends for game", () => {
    const backends = getBackendsForAppType("game");
    expect(backends.map((b) => b.id)).toContain("sqlite");
    expect(backends.map((b) => b.id)).not.toContain("supabase-db");
  });
});

describe("getAuthForAppType", () => {
  it("returns all auth for web", () => {
    const auth = getAuthForAppType("web");
    expect(auth).toHaveLength(4);
  });

  it("returns no auth for game", () => {
    const auth = getAuthForAppType("game");
    expect(auth).toHaveLength(0);
  });
});

describe("getFeatureCategoriesForAppType", () => {
  it("returns mobile-specific categories", () => {
    const categories = getFeatureCategoriesForAppType("mobile");
    const labels = categories.map((c) => c.label);
    expect(labels).toContain("Mobile Native");
    expect(labels).not.toContain("Desktop Native");
  });

  it("returns game-specific categories", () => {
    const categories = getFeatureCategoriesForAppType("game");
    const labels = categories.map((c) => c.label);
    expect(labels).toEqual(["Game Core"]);
  });
});

describe("getConstraintsForAppType", () => {
  it("returns all constraints for web", () => {
    const constraints = getConstraintsForAppType("web");
    expect(constraints).toHaveLength(6);
  });

  it("returns only ai-files for game", () => {
    const constraints = getConstraintsForAppType("game");
    expect(constraints).toHaveLength(1);
    expect(constraints[0].id).toBe("ai-files");
  });
});

describe("PLATFORMS_WITH_DEV_SERVER", () => {
  it("includes web platforms", () => {
    expect(PLATFORMS_WITH_DEV_SERVER.has("nextjs")).toBe(true);
    expect(PLATFORMS_WITH_DEV_SERVER.has("react-spa")).toBe(true);
  });

  it("includes flutter", () => {
    expect(PLATFORMS_WITH_DEV_SERVER.has("flutter")).toBe(true);
  });

  it("excludes game engines", () => {
    expect(PLATFORMS_WITH_DEV_SERVER.has("godot")).toBe(false);
    expect(PLATFORMS_WITH_DEV_SERVER.has("bevy")).toBe(false);
    expect(PLATFORMS_WITH_DEV_SERVER.has("pygame")).toBe(false);
  });
});

describe("PLATFORM_PREVIEW_STRATEGY", () => {
  it("has an entry for every platform", () => {
    for (const p of PLATFORMS) {
      expect(PLATFORM_PREVIEW_STRATEGY[p.id]).toBeDefined();
    }
  });

  it("maps web platforms to iframe", () => {
    expect(PLATFORM_PREVIEW_STRATEGY.nextjs).toBe("iframe");
    expect(PLATFORM_PREVIEW_STRATEGY["tanstack-start"]).toBe("iframe");
    expect(PLATFORM_PREVIEW_STRATEGY["react-spa"]).toBe("iframe");
    expect(PLATFORM_PREVIEW_STRATEGY["node-api"]).toBe("iframe");
    expect(PLATFORM_PREVIEW_STRATEGY["desktop-app"]).toBe("iframe");
  });

  it("maps expo, flutter, and react-native to iframe-web-mode", () => {
    expect(PLATFORM_PREVIEW_STRATEGY.expo).toBe("iframe-web-mode");
    expect(PLATFORM_PREVIEW_STRATEGY.flutter).toBe("iframe-web-mode");
    expect(PLATFORM_PREVIEW_STRATEGY["react-native"]).toBe("iframe-web-mode");
  });

  it("maps non-web platforms to run-instructions", () => {
    expect(PLATFORM_PREVIEW_STRATEGY.godot).toBe("run-instructions");
    expect(PLATFORM_PREVIEW_STRATEGY.bevy).toBe("run-instructions");
    expect(PLATFORM_PREVIEW_STRATEGY.pygame).toBe("run-instructions");
    expect(PLATFORM_PREVIEW_STRATEGY.cli).toBe("run-instructions");
  });
});

describe("PLATFORM_RUN_INSTRUCTIONS", () => {
  it("has entries for all run-instructions platforms", () => {
    for (const [platform, strategy] of Object.entries(PLATFORM_PREVIEW_STRATEGY)) {
      if (strategy === "run-instructions") {
        expect(PLATFORM_RUN_INSTRUCTIONS[platform]).toBeDefined();
      }
    }
  });

  it("each entry has title, runCommand, and non-empty steps", () => {
    for (const [, instruction] of Object.entries(PLATFORM_RUN_INSTRUCTIONS)) {
      expect(instruction.title).toBeTruthy();
      expect(instruction.runCommand).toBeTruthy();
      expect(instruction.description).toBeTruthy();
      expect(instruction.steps.length).toBeGreaterThan(0);
    }
  });
});

describe("getEffectivePreviewStrategy", () => {
  it("returns iframe for web platforms", () => {
    expect(getEffectivePreviewStrategy("nextjs")).toBe("iframe");
  });

  it("returns iframe-web-mode for expo by default", () => {
    expect(getEffectivePreviewStrategy("expo")).toBe("iframe-web-mode");
  });

  it("returns run-instructions for expo without web target", () => {
    expect(getEffectivePreviewStrategy("expo", { "expo-targets": "ios,android" })).toBe("run-instructions");
  });

  it("returns iframe-web-mode for expo with web target", () => {
    expect(getEffectivePreviewStrategy("expo", { "expo-targets": "ios,android,web" })).toBe("iframe-web-mode");
  });

  it("returns run-instructions for flutter without web target", () => {
    expect(getEffectivePreviewStrategy("flutter", { "flutter-targets": "ios,android" })).toBe("run-instructions");
  });

  it("returns iframe-web-mode for flutter with web target", () => {
    expect(getEffectivePreviewStrategy("flutter", { "flutter-targets": "ios,web" })).toBe("iframe-web-mode");
  });

  it("returns iframe-web-mode for react-native by default", () => {
    expect(getEffectivePreviewStrategy("react-native")).toBe("iframe-web-mode");
  });

  it("returns run-instructions for react-native without web target", () => {
    expect(getEffectivePreviewStrategy("react-native", { "rn-targets": "ios,android" })).toBe("run-instructions");
  });

  it("returns iframe-web-mode for react-native with web target", () => {
    expect(getEffectivePreviewStrategy("react-native", { "rn-targets": "ios,android,web" })).toBe("iframe-web-mode");
  });

  it("falls back to run-instructions for unknown platform", () => {
    expect(getEffectivePreviewStrategy("unknown")).toBe("run-instructions");
  });

  it("returns run-instructions for godot regardless of toolVersions", () => {
    expect(getEffectivePreviewStrategy("godot", {})).toBe("run-instructions");
  });
});
