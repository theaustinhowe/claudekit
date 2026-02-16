import { describe, expect, it } from "vitest";
import { matchPolicy } from "@/lib/services/policy-matcher";
import type { Policy } from "@/lib/types";

function makePolicy(overrides: Partial<Policy> & { id: string; repo_types: Policy["repo_types"] }): Policy {
  return {
    name: "Test",
    description: null,
    expected_versions: {},
    banned_dependencies: [],
    allowed_package_managers: [],
    preferred_package_manager: "pnpm",
    ignore_patterns: [],
    generator_defaults: { features: [] },
    is_builtin: false,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

describe("matchPolicy", () => {
  const monorepoPolicy = makePolicy({ id: "mono", repo_types: ["monorepo"] });
  const nextjsPolicy = makePolicy({ id: "nextjs", repo_types: ["nextjs"] });
  const nodePolicy = makePolicy({ id: "node", repo_types: ["node"] });
  const fallbackPolicy = makePolicy({ id: "fallback", repo_types: [] });

  it("returns undefined for empty policies array", () => {
    expect(matchPolicy({ repo_type: "nextjs", is_monorepo: false }, [])).toBeUndefined();
  });

  it("matches monorepo policy when repo is_monorepo", () => {
    const result = matchPolicy({ repo_type: "nextjs", is_monorepo: true }, [nextjsPolicy, monorepoPolicy, nodePolicy]);
    expect(result?.id).toBe("mono");
  });

  it("falls through to exact type match when no monorepo policy exists", () => {
    const result = matchPolicy({ repo_type: "nextjs", is_monorepo: true }, [nextjsPolicy, nodePolicy]);
    expect(result?.id).toBe("nextjs");
  });

  it("matches exact repo_type", () => {
    const result = matchPolicy({ repo_type: "nextjs", is_monorepo: false }, [nodePolicy, nextjsPolicy]);
    expect(result?.id).toBe("nextjs");
  });

  it("uses fallback policy ID when no type match", () => {
    const result = matchPolicy(
      { repo_type: "react", is_monorepo: false },
      [nodePolicy, nextjsPolicy, fallbackPolicy],
      "fallback",
    );
    expect(result?.id).toBe("fallback");
  });

  it("returns first policy as last resort", () => {
    const result = matchPolicy({ repo_type: "react", is_monorepo: false }, [nodePolicy, nextjsPolicy]);
    expect(result?.id).toBe("node");
  });

  it("handles null repo_type", () => {
    const result = matchPolicy({ repo_type: null, is_monorepo: false }, [nodePolicy, nextjsPolicy]);
    expect(result?.id).toBe("node");
  });

  it("monorepo priority beats exact type match", () => {
    const result = matchPolicy({ repo_type: "nextjs", is_monorepo: true }, [nextjsPolicy, monorepoPolicy]);
    expect(result?.id).toBe("mono");
  });

  it("exact type match beats fallback", () => {
    const result = matchPolicy(
      { repo_type: "node", is_monorepo: false },
      [nextjsPolicy, nodePolicy, fallbackPolicy],
      "fallback",
    );
    expect(result?.id).toBe("node");
  });

  it("fallback ID that does not exist falls to first policy", () => {
    const result = matchPolicy({ repo_type: "react", is_monorepo: false }, [nodePolicy, nextjsPolicy], "nonexistent");
    expect(result?.id).toBe("node");
  });
});
