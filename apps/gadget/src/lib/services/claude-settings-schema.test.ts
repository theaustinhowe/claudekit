import { describe, expect, it } from "vitest";
import {
  getDefaultSettings,
  getFieldValue,
  parseJsonToFormState,
  SETTINGS_CATEGORIES,
  serializeFormToJson,
  setFieldValue,
} from "@/lib/services/claude-settings-schema";

describe("getFieldValue", () => {
  it("gets a top-level value", () => {
    expect(getFieldValue({ model: "claude-opus-4-6" }, "model")).toBe("claude-opus-4-6");
  });

  it("gets a nested value", () => {
    const obj = { permissions: { allow: ["Read", "Write"] } };
    expect(getFieldValue(obj, "permissions.allow")).toEqual(["Read", "Write"]);
  });

  it("gets a deeply nested value", () => {
    const obj = { sandbox: { network: { allowedDomains: ["example.com"] } } };
    expect(getFieldValue(obj, "sandbox.network.allowedDomains")).toEqual(["example.com"]);
  });

  it("returns undefined for missing path", () => {
    expect(getFieldValue({}, "missing.path")).toBeUndefined();
  });

  it("returns undefined when intermediate is null", () => {
    expect(getFieldValue({ a: null }, "a.b")).toBeUndefined();
  });

  it("returns undefined when intermediate is not an object", () => {
    expect(getFieldValue({ a: "string" }, "a.b")).toBeUndefined();
  });

  it("returns the value even if it is falsy", () => {
    expect(getFieldValue({ flag: false }, "flag")).toBe(false);
    expect(getFieldValue({ count: 0 }, "count")).toBe(0);
    expect(getFieldValue({ name: "" }, "name")).toBe("");
  });
});

describe("setFieldValue", () => {
  it("sets a top-level value", () => {
    const result = setFieldValue({}, "model", "claude-opus-4-6");
    expect(result.model).toBe("claude-opus-4-6");
  });

  it("sets a nested value", () => {
    const result = setFieldValue({}, "permissions.allow", ["Read"]);
    expect(result).toEqual({ permissions: { allow: ["Read"] } });
  });

  it("sets a deeply nested value", () => {
    const result = setFieldValue({}, "sandbox.network.allowedDomains", ["example.com"]);
    expect(result).toEqual({ sandbox: { network: { allowedDomains: ["example.com"] } } });
  });

  it("does not mutate the original object", () => {
    const original = { model: "old" };
    const result = setFieldValue(original, "model", "new");
    expect(original.model).toBe("old");
    expect(result.model).toBe("new");
  });

  it("preserves existing sibling keys", () => {
    const original = { permissions: { allow: ["Read"], deny: ["Bash"] } };
    const result = setFieldValue(original, "permissions.allow", ["Write"]);
    expect(result.permissions).toEqual({ allow: ["Write"], deny: ["Bash"] });
  });

  it("creates intermediate objects when needed", () => {
    const result = setFieldValue({}, "a.b.c", "deep");
    expect(result).toEqual({ a: { b: { c: "deep" } } });
  });

  it("overwrites non-object intermediate with object", () => {
    const result = setFieldValue({ a: "string" }, "a.b", "value");
    expect(result).toEqual({ a: { b: "value" } });
  });
});

describe("parseJsonToFormState", () => {
  it("separates known and unknown fields", () => {
    const json = JSON.stringify({
      model: "claude-opus-4-6",
      customStuff: { foo: "bar" },
    });
    const { settings, unknownFields } = parseJsonToFormState(json);
    expect(settings.model).toBe("claude-opus-4-6");
    expect(unknownFields.customStuff).toEqual({ foo: "bar" });
  });

  it("extracts env keys into _env form state", () => {
    const json = JSON.stringify({
      env: {
        CLAUDE_CODE_EFFORT_LEVEL: "high",
        CUSTOM_VAR: "value",
      },
    });
    const { settings } = parseJsonToFormState(json);
    const envState = settings._env as Record<string, unknown>;
    expect(envState.CLAUDE_CODE_EFFORT_LEVEL).toBe("high");
    const envObj = settings.env as Record<string, string>;
    expect(envObj.CUSTOM_VAR).toBe("value");
    expect(envObj.CLAUDE_CODE_EFFORT_LEVEL).toBeUndefined();
  });

  it("converts boolean env vars from '1' to true", () => {
    const json = JSON.stringify({
      env: {
        DISABLE_TELEMETRY: "1",
      },
    });
    const { settings } = parseJsonToFormState(json);
    const envState = settings._env as Record<string, unknown>;
    expect(envState.DISABLE_TELEMETRY).toBe(true);
  });

  it("handles empty JSON", () => {
    const { settings, unknownFields } = parseJsonToFormState("{}");
    expect(settings._env).toEqual({});
    expect(unknownFields).toEqual({});
  });

  it("handles permissions as a known field", () => {
    const json = JSON.stringify({
      permissions: { allow: ["Read"], deny: [] },
    });
    const { settings, unknownFields } = parseJsonToFormState(json);
    expect(settings.permissions).toEqual({ allow: ["Read"], deny: [] });
    expect(Object.keys(unknownFields)).toHaveLength(0);
  });
});

describe("serializeFormToJson", () => {
  it("merges env form state back into env object", () => {
    const settings = {
      model: "claude-opus-4-6",
      env: { CUSTOM: "val" },
      _env: { CLAUDE_CODE_EFFORT_LEVEL: "high" },
    };
    const json = serializeFormToJson(settings, {});
    const parsed = JSON.parse(json);
    expect(parsed.env.CLAUDE_CODE_EFFORT_LEVEL).toBe("high");
    expect(parsed.env.CUSTOM).toBe("val");
    expect(parsed._env).toBeUndefined();
  });

  it("converts boolean env vars to '1'", () => {
    const settings = {
      env: {},
      _env: { DISABLE_TELEMETRY: true },
    };
    const json = serializeFormToJson(settings, {});
    const parsed = JSON.parse(json);
    expect(parsed.env.DISABLE_TELEMETRY).toBe("1");
  });

  it("removes false boolean env vars from env", () => {
    const settings = {
      env: {},
      _env: { DISABLE_TELEMETRY: false },
    };
    const json = serializeFormToJson(settings, {});
    const parsed = JSON.parse(json);
    expect(parsed.env).toBeUndefined();
  });

  it("strips empty values", () => {
    const settings = {
      model: "",
      permissions: { allow: [] },
      env: {},
      _env: {},
    };
    const json = serializeFormToJson(settings, {});
    const parsed = JSON.parse(json);
    expect(parsed.model).toBeUndefined();
    expect(parsed.permissions).toBeUndefined();
    expect(parsed.env).toBeUndefined();
  });

  it("preserves unknown fields", () => {
    const settings = { env: {}, _env: {} };
    const unknownFields = { customPlugin: { enabled: true } };
    const json = serializeFormToJson(settings, unknownFields);
    const parsed = JSON.parse(json);
    expect(parsed.customPlugin).toEqual({ enabled: true });
  });

  it("sets CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS when teammateMode is set", () => {
    const settings = {
      teammateMode: "auto",
      env: {},
      _env: {},
    };
    const json = serializeFormToJson(settings, {});
    const parsed = JSON.parse(json);
    expect(parsed.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS).toBe("1");
  });

  it("removes CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS when teammateMode is empty", () => {
    const settings = {
      teammateMode: "",
      env: { CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1" },
      _env: {},
    };
    const json = serializeFormToJson(settings, {});
    const parsed = JSON.parse(json);
    expect(parsed.env?.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS).toBeUndefined();
  });

  it("preserves false boolean settings (not stripped as empty)", () => {
    const settings = {
      disableAllHooks: false,
      env: {},
      _env: {},
    };
    const json = serializeFormToJson(settings, {});
    const parsed = JSON.parse(json);
    expect(parsed.disableAllHooks).toBe(false);
  });
});

describe("round-trip parse/serialize", () => {
  it("preserves data through parse then serialize", () => {
    const original = {
      model: "claude-opus-4-6",
      permissions: { allow: ["Read", "Write"], deny: ["Bash(rm -rf *)"] },
      env: {
        CLAUDE_CODE_EFFORT_LEVEL: "high",
        CUSTOM_VAR: "keepme",
      },
      unknownPlugin: { setting: true },
    };
    const jsonStr = JSON.stringify(original);
    const { settings, unknownFields } = parseJsonToFormState(jsonStr);
    const serialized = serializeFormToJson(settings, unknownFields);
    const reparsed = JSON.parse(serialized);

    expect(reparsed.model).toBe("claude-opus-4-6");
    expect(reparsed.permissions.allow).toEqual(["Read", "Write"]);
    expect(reparsed.permissions.deny).toEqual(["Bash(rm -rf *)"]);
    expect(reparsed.env.CLAUDE_CODE_EFFORT_LEVEL).toBe("high");
    expect(reparsed.env.CUSTOM_VAR).toBe("keepme");
    expect(reparsed.unknownPlugin).toEqual({ setting: true });
  });
});

describe("getDefaultSettings", () => {
  it("returns permissions with default allow rules", () => {
    const defaults = getDefaultSettings();
    expect(defaults.permissions).toEqual({
      allow: ["Read", "Write", "Bash", "Glob", "Grep"],
    });
  });
});

describe("SETTINGS_CATEGORIES", () => {
  it("has expected category IDs", () => {
    const ids = SETTINGS_CATEGORIES.map((c) => c.id);
    expect(ids).toContain("permissions");
    expect(ids).toContain("model");
    expect(ids).toContain("env");
    expect(ids).toContain("mcp");
    expect(ids).toContain("execution");
    expect(ids).toContain("sandbox");
    expect(ids).toContain("privacy");
  });

  it("each category has at least one field", () => {
    for (const cat of SETTINGS_CATEGORIES) {
      expect(cat.fields.length).toBeGreaterThan(0);
    }
  });

  it("each field has required properties", () => {
    for (const cat of SETTINGS_CATEGORIES) {
      for (const field of cat.fields) {
        expect(field.path).toBeTruthy();
        expect(field.label).toBeTruthy();
        expect(field.description).toBeTruthy();
        expect(field.type).toBeTruthy();
      }
    }
  });
});
