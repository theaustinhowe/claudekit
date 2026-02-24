import { describe, expect, it } from "vitest";
import {
  ANALYTICS_OPTIONS,
  APP_NAME,
  AUTH_OPTIONS,
  BACKEND_OPTIONS,
  CONSTRAINT_OPTIONS,
  DESIGN_VIBES,
  EMAIL_OPTIONS,
  FEATURE_OPTIONS,
  FRAMEWORK_OPTIONS,
  IMAGE_EXTENSIONS,
  IMAGE_MIME_TYPES,
  PAYMENT_OPTIONS,
  PLATFORM_NEXT_STEPS,
  PLATFORMS,
  SERVICE_NEXT_STEPS,
  SESSION_EVENT_BUFFER_SIZE,
  SESSION_HEARTBEAT_INTERVAL_MS,
  SESSION_LOG_FLUSH_INTERVAL_MS,
  SESSION_TYPE_LABELS,
} from "./constants";

describe("APP_NAME", () => {
  it("is Inside", () => {
    expect(APP_NAME).toBe("Inside");
  });
});

describe("PLATFORMS", () => {
  it("has 5 platforms", () => {
    expect(PLATFORMS).toHaveLength(5);
  });

  it("each platform has id, label, description", () => {
    for (const p of PLATFORMS) {
      expect(p.id).toBeTruthy();
      expect(p.label).toBeTruthy();
      expect(p.description).toBeTruthy();
    }
  });

  it("includes nextjs", () => {
    expect(PLATFORMS.find((p) => p.id === "nextjs")).toBeDefined();
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

describe("FRAMEWORK_OPTIONS", () => {
  it("includes all PLATFORMS plus tanstack-start", () => {
    expect(FRAMEWORK_OPTIONS.length).toBe(PLATFORMS.length + 1);
    expect(FRAMEWORK_OPTIONS.find((f) => f.id === "tanstack-start")).toBeDefined();
  });
});

describe("BACKEND_OPTIONS", () => {
  it("has 5 options", () => {
    expect(BACKEND_OPTIONS).toHaveLength(5);
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
  it("has 6 options", () => {
    expect(FEATURE_OPTIONS).toHaveLength(6);
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
