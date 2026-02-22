import { describe, expect, it } from "vitest";
import { deduplicateVariables, type EnvExampleFile, parseEnvExample } from "./env-parser";

describe("parseEnvExample", () => {
  it("returns empty array for empty string", () => {
    expect(parseEnvExample("")).toEqual([]);
  });

  it("returns empty array for whitespace-only content", () => {
    expect(parseEnvExample("   \n\n  \n")).toEqual([]);
  });

  it("parses active variable as required", () => {
    const result = parseEnvExample("API_KEY=abc123");
    expect(result).toEqual([
      {
        key: "API_KEY",
        defaultValue: "abc123",
        description: "",
        required: true,
        group: "",
      },
    ]);
  });

  it("parses commented variable as not required", () => {
    const result = parseEnvExample("# API_KEY=abc123");
    expect(result).toEqual([
      {
        key: "API_KEY",
        defaultValue: "abc123",
        description: "",
        required: false,
        group: "",
      },
    ]);
  });

  it("parses commented variable with empty value", () => {
    const result = parseEnvExample("# API_KEY=");
    expect(result).toEqual([
      {
        key: "API_KEY",
        defaultValue: "",
        description: "",
        required: false,
        group: "",
      },
    ]);
  });

  it("attaches comment lines as description", () => {
    // lowercase start avoids group header detection
    const content = "# your API key for authentication\nAPI_KEY=abc";
    const result = parseEnvExample(content);
    expect(result[0].description).toBe("your API key for authentication");
  });

  it("joins multi-line comments with space", () => {
    // lowercase start puts first line in comment buffer, second follows
    const content = "# first line\n# second line\nAPI_KEY=abc";
    const result = parseEnvExample(content);
    expect(result[0].description).toBe("first line second line");
  });

  it("resets comment buffer on blank line", () => {
    const content = "# comment for KEY_A\nKEY_A=a\n\n# comment for KEY_B\nKEY_B=b";
    const result = parseEnvExample(content);
    expect(result[0].description).toBe("comment for KEY_A");
    expect(result[1].description).toBe("comment for KEY_B");
  });

  it("loses comment buffer after blank line with no variable", () => {
    const content = "# Orphaned comment\n\nKEY=val";
    const result = parseEnvExample(content);
    expect(result[0].description).toBe("");
  });

  it("detects 'Required' group header", () => {
    const content = "# Required\nAPI_KEY=abc";
    const result = parseEnvExample(content);
    expect(result[0].group).toBe("Required");
  });

  it("detects 'Optional' group header", () => {
    const content = "# Optional\n# SECRET_KEY=xyz";
    const result = parseEnvExample(content);
    expect(result[0].group).toBe("Optional");
  });

  it("detects 'MCP Server' group header", () => {
    const content = "# MCP Server Configuration\nMCP_TOKEN=abc";
    const result = parseEnvExample(content);
    expect(result[0].group).toBe("MCP Server Configuration");
  });

  it("detects short capitalized lines as group headers", () => {
    const content = "# Database Settings\nDB_HOST=localhost";
    const result = parseEnvExample(content);
    expect(result[0].group).toBe("Database Settings");
  });

  it("extracts @url directive and attaches to next variable", () => {
    const content = "# @url https://example.com/docs\nAPI_KEY=abc";
    const result = parseEnvExample(content);
    expect(result[0].url).toBe("https://example.com/docs");
  });

  it("extracts @hint directive and attaches to next variable", () => {
    const content = "# @hint Use your production key\nAPI_KEY=abc";
    const result = parseEnvExample(content);
    expect(result[0].hint).toBe("Use your production key");
  });

  it("attaches both @url and @hint to same variable", () => {
    const content = "# @url https://example.com\n# @hint Get key from dashboard\nAPI_KEY=abc";
    const result = parseEnvExample(content);
    expect(result[0].url).toBe("https://example.com");
    expect(result[0].hint).toBe("Get key from dashboard");
  });

  it("resets directives on blank line", () => {
    const content = "# @url https://example.com\n\nAPI_KEY=abc";
    const result = parseEnvExample(content);
    expect(result[0].url).toBeUndefined();
  });

  it("attaches @url to commented variable", () => {
    const content = "# @url https://docs.example.com\n# API_KEY=abc";
    const result = parseEnvExample(content);
    expect(result[0].url).toBe("https://docs.example.com");
    expect(result[0].required).toBe(false);
  });

  it("attaches @hint to commented variable", () => {
    const content = "# @hint Use staging key\n# API_KEY=abc";
    const result = parseEnvExample(content);
    expect(result[0].hint).toBe("Use staging key");
  });

  it("ignores lines that do not match any pattern", () => {
    const content = "some-random-text\nAPI_KEY=abc";
    const result = parseEnvExample(content);
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe("API_KEY");
  });

  it("clears defaultValue and sets placeholder for placeholder pattern", () => {
    const result = parseEnvExample("API_KEY=your-api-key-here");
    expect(result[0].defaultValue).toBe("");
    expect(result[0].placeholder).toBe("your-api-key-here");
  });

  it("keeps non-placeholder values as defaultValue", () => {
    const result = parseEnvExample("PORT=3000");
    expect(result[0].defaultValue).toBe("3000");
    expect(result[0].placeholder).toBeUndefined();
  });

  it("handles placeholder pattern in commented variable", () => {
    const result = parseEnvExample("# TOKEN=your-token-here");
    expect(result[0].defaultValue).toBe("");
    expect(result[0].placeholder).toBe("your-token-here");
    expect(result[0].required).toBe(false);
  });

  it("handles values containing = sign (URLs)", () => {
    const result = parseEnvExample("CALLBACK_URL=https://example.com/cb?code=abc");
    expect(result[0].key).toBe("CALLBACK_URL");
    expect(result[0].defaultValue).toBe("https://example.com/cb?code=abc");
  });

  it("preserves order of mixed active and commented variables", () => {
    const content = "ACTIVE_A=1\n# COMMENTED_B=2\nACTIVE_C=3";
    const result = parseEnvExample(content);
    expect(result.map((v) => v.key)).toEqual(["ACTIVE_A", "COMMENTED_B", "ACTIVE_C"]);
    expect(result[0].required).toBe(true);
    expect(result[1].required).toBe(false);
    expect(result[2].required).toBe(true);
  });

  it("handles active variable with empty value", () => {
    const result = parseEnvExample("API_KEY=");
    expect(result[0].key).toBe("API_KEY");
    expect(result[0].defaultValue).toBe("");
    expect(result[0].required).toBe(true);
  });

  it("integration: realistic .env.example content", () => {
    const content = [
      "# Required",
      "# @url https://github.com/settings/tokens",
      "# @hint Needs repo + read:org scopes",
      "# personal access token for GitHub API access",
      "GITHUB_PERSONAL_ACCESS_TOKEN=your-github-token-here",
      "",
      "# Optional",
      "# log level for the app",
      "LOG_LEVEL=info",
      "",
      "# Database",
      "# @hint Relative to monorepo root",
      "# DATABASE_PATH=./data/claudekit.duckdb",
    ].join("\n");

    const result = parseEnvExample(content);
    expect(result).toHaveLength(3);

    // First: required active variable with directives and placeholder
    expect(result[0].key).toBe("GITHUB_PERSONAL_ACCESS_TOKEN");
    expect(result[0].required).toBe(true);
    expect(result[0].group).toBe("Required");
    expect(result[0].url).toBe("https://github.com/settings/tokens");
    expect(result[0].hint).toBe("Needs repo + read:org scopes");
    expect(result[0].description).toBe("personal access token for GitHub API access");
    expect(result[0].placeholder).toBe("your-github-token-here");
    expect(result[0].defaultValue).toBe("");

    // Second: active variable with default value
    expect(result[1].key).toBe("LOG_LEVEL");
    expect(result[1].required).toBe(true);
    expect(result[1].group).toBe("Optional");
    expect(result[1].defaultValue).toBe("info");
    expect(result[1].description).toBe("log level for the app");

    // Third: commented variable
    expect(result[2].key).toBe("DATABASE_PATH");
    expect(result[2].required).toBe(false);
    expect(result[2].group).toBe("Database");
    expect(result[2].hint).toBe("Relative to monorepo root");
    expect(result[2].defaultValue).toBe("./data/claudekit.duckdb");
  });
});

describe("deduplicateVariables", () => {
  const makeFile = (
    appId: string,
    label: string,
    vars: Partial<import("./env-parser").EnvVariable>[],
  ): EnvExampleFile => ({
    appId,
    label,
    variables: vars.map((v) => ({
      key: v.key ?? "KEY",
      defaultValue: v.defaultValue ?? "",
      description: v.description ?? "",
      required: v.required ?? false,
      group: v.group ?? "",
      ...v,
    })),
  });

  it("returns empty results for empty files array", () => {
    const result = deduplicateVariables([]);
    expect(result.sharedVariables).toEqual([]);
    expect(result.appVariables).toEqual({});
  });

  it("marks variable in 2+ files as shared", () => {
    const files = [
      makeFile("app1", "App 1", [{ key: "SHARED_KEY" }]),
      makeFile("app2", "App 2", [{ key: "SHARED_KEY" }]),
    ];
    const result = deduplicateVariables(files);
    expect(result.sharedVariables).toHaveLength(1);
    expect(result.sharedVariables[0].key).toBe("SHARED_KEY");
    expect(result.sharedVariables[0].sources).toEqual([
      { appId: "app1", label: "App 1" },
      { appId: "app2", label: "App 2" },
    ]);
  });

  it("marks root-only variable as shared", () => {
    const files = [makeFile("root", "Root", [{ key: "ROOT_KEY" }])];
    const result = deduplicateVariables(files);
    expect(result.sharedVariables).toHaveLength(1);
    expect(result.sharedVariables[0].key).toBe("ROOT_KEY");
  });

  it("marks single non-root variable as app-specific", () => {
    const files = [makeFile("gadget", "Gadget", [{ key: "GADGET_KEY" }])];
    const result = deduplicateVariables(files);
    expect(result.sharedVariables).toHaveLength(0);
    expect(result.appVariables.gadget).toBeDefined();
    expect(result.appVariables.gadget.label).toBe("Gadget");
    expect(result.appVariables.gadget.variables).toHaveLength(1);
    expect(result.appVariables.gadget.variables[0].key).toBe("GADGET_KEY");
  });

  it("merging: longest description wins", () => {
    const files = [
      makeFile("app1", "App 1", [{ key: "KEY", description: "Short" }]),
      makeFile("app2", "App 2", [{ key: "KEY", description: "A much longer description here" }]),
    ];
    const result = deduplicateVariables(files);
    expect(result.sharedVariables[0].description).toBe("A much longer description here");
  });

  it("merging: any required: true makes merged required", () => {
    const files = [
      makeFile("app1", "App 1", [{ key: "KEY", required: false }]),
      makeFile("app2", "App 2", [{ key: "KEY", required: true }]),
    ];
    const result = deduplicateVariables(files);
    expect(result.sharedVariables[0].required).toBe(true);
  });

  it("merging: first non-empty defaultValue wins", () => {
    const files = [
      makeFile("app1", "App 1", [{ key: "KEY", defaultValue: "" }]),
      makeFile("app2", "App 2", [{ key: "KEY", defaultValue: "fallback" }]),
    ];
    const result = deduplicateVariables(files);
    expect(result.sharedVariables[0].defaultValue).toBe("fallback");
  });

  it("merging: first non-empty placeholder wins", () => {
    const files = [
      makeFile("app1", "App 1", [{ key: "KEY" }]),
      makeFile("app2", "App 2", [{ key: "KEY", placeholder: "your-key-here" }]),
    ];
    const result = deduplicateVariables(files);
    expect(result.sharedVariables[0].placeholder).toBe("your-key-here");
  });

  it("merging: first non-empty url wins", () => {
    const files = [
      makeFile("app1", "App 1", [{ key: "KEY" }]),
      makeFile("app2", "App 2", [{ key: "KEY", url: "https://docs.example.com" }]),
    ];
    const result = deduplicateVariables(files);
    expect(result.sharedVariables[0].url).toBe("https://docs.example.com");
  });

  it("merging: first non-empty hint wins", () => {
    const files = [
      makeFile("app1", "App 1", [{ key: "KEY", hint: "use prod key" }]),
      makeFile("app2", "App 2", [{ key: "KEY", hint: "second hint" }]),
    ];
    const result = deduplicateVariables(files);
    expect(result.sharedVariables[0].hint).toBe("use prod key");
  });

  it("sources array includes all file sources", () => {
    const files = [
      makeFile("root", "Root", [{ key: "KEY" }]),
      makeFile("gadget", "Gadget", [{ key: "KEY" }]),
      makeFile("b4u", "B4U", [{ key: "KEY" }]),
    ];
    const result = deduplicateVariables(files);
    expect(result.sharedVariables[0].sources).toHaveLength(3);
    expect(result.sharedVariables[0].sources).toEqual([
      { appId: "root", label: "Root" },
      { appId: "gadget", label: "Gadget" },
      { appId: "b4u", label: "B4U" },
    ]);
  });

  it("groups multiple app-specific variables by appId", () => {
    const files = [makeFile("gadget", "Gadget", [{ key: "A" }, { key: "B" }]), makeFile("b4u", "B4U", [{ key: "C" }])];
    const result = deduplicateVariables(files);
    expect(result.appVariables.gadget.variables).toHaveLength(2);
    expect(result.appVariables.b4u.variables).toHaveLength(1);
    expect(result.appVariables.b4u.label).toBe("B4U");
  });

  it("handles mix of shared and app-specific variables", () => {
    const files = [
      makeFile("root", "Root", [{ key: "SHARED" }]),
      makeFile("gadget", "Gadget", [{ key: "SHARED" }, { key: "GADGET_ONLY" }]),
    ];
    const result = deduplicateVariables(files);
    expect(result.sharedVariables).toHaveLength(1);
    expect(result.sharedVariables[0].key).toBe("SHARED");
    expect(result.appVariables.gadget.variables).toHaveLength(1);
    expect(result.appVariables.gadget.variables[0].key).toBe("GADGET_ONLY");
  });
});
