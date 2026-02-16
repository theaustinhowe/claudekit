import { describe, expect, it } from "vitest";
import { calculateModelCost } from "./pricing";
import type { TokenCounts } from "./types";

const zeroTokens: TokenCounts = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadInputTokens: 0,
  cacheCreationInputTokens: 0,
};

describe("calculateModelCost", () => {
  it("returns correct cost for claude-opus-4-5", () => {
    const tokens: TokenCounts = {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
    };
    // input: 15 $/M + output: 75 $/M = 90
    const cost = calculateModelCost("claude-opus-4-5", tokens);
    expect(cost).toBeCloseTo(90, 5);
  });

  it("returns correct cost for claude-opus-4-6", () => {
    const tokens: TokenCounts = {
      inputTokens: 500_000,
      outputTokens: 200_000,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
    };
    // input: 500k * 15/1M = 7.5, output: 200k * 75/1M = 15 => 22.5
    const cost = calculateModelCost("claude-opus-4-6", tokens);
    expect(cost).toBeCloseTo(22.5, 5);
  });

  it("returns correct cost for claude-sonnet-4-5", () => {
    const tokens: TokenCounts = {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
    };
    // input: 3 $/M + output: 15 $/M = 18
    const cost = calculateModelCost("claude-sonnet-4-5", tokens);
    expect(cost).toBeCloseTo(18, 5);
  });

  it("returns correct cost for claude-haiku-4-5", () => {
    const tokens: TokenCounts = {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
    };
    // input: 0.8 $/M + output: 4 $/M = 4.8
    const cost = calculateModelCost("claude-haiku-4-5", tokens);
    expect(cost).toBeCloseTo(4.8, 5);
  });

  it("includes cache write and cache read costs", () => {
    const tokens: TokenCounts = {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadInputTokens: 1_000_000,
      cacheCreationInputTokens: 1_000_000,
    };
    // opus-4-5: cacheRead: 1.5 $/M + cacheWrite: 18.75 $/M = 20.25
    const cost = calculateModelCost("claude-opus-4-5", tokens);
    expect(cost).toBeCloseTo(20.25, 5);
  });

  it("combines all token types for total cost", () => {
    const tokens: TokenCounts = {
      inputTokens: 100_000,
      outputTokens: 50_000,
      cacheReadInputTokens: 200_000,
      cacheCreationInputTokens: 80_000,
    };
    // sonnet-4-5: input 100k*3/1M=0.3, output 50k*15/1M=0.75, cacheRead 200k*0.3/1M=0.06, cacheWrite 80k*3.75/1M=0.3
    const cost = calculateModelCost("claude-sonnet-4-5", tokens);
    expect(cost).toBeCloseTo(0.3 + 0.75 + 0.06 + 0.3, 5);
  });

  it("returns 0 for unknown model", () => {
    const tokens: TokenCounts = {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
    };
    expect(calculateModelCost("unknown-model-xyz", tokens)).toBe(0);
  });

  it("returns 0 for zero tokens on a known model", () => {
    expect(calculateModelCost("claude-opus-4-5", zeroTokens)).toBe(0);
  });

  it("strips date suffix to match known model", () => {
    const tokens: TokenCounts = {
      inputTokens: 1_000_000,
      outputTokens: 0,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
    };
    // "claude-opus-4-5-20251101" should strip to "claude-opus-4-5" => input cost = 15
    const cost = calculateModelCost("claude-opus-4-5-20251101", tokens);
    expect(cost).toBeCloseTo(15, 5);
  });

  it("matches model by prefix when exact and stripped do not match", () => {
    const tokens: TokenCounts = {
      inputTokens: 1_000_000,
      outputTokens: 0,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
    };
    // "claude-sonnet-4-5-extra-variant" stripped by regex becomes "claude-sonnet-4-5-extra-variant" (no date suffix)
    // Then prefix match: starts with "claude-sonnet-4-5" => input cost = 3
    const cost = calculateModelCost("claude-sonnet-4-5-extra-variant", tokens);
    expect(cost).toBeCloseTo(3, 5);
  });

  it("handles very small token counts precisely", () => {
    const tokens: TokenCounts = {
      inputTokens: 1,
      outputTokens: 1,
      cacheReadInputTokens: 1,
      cacheCreationInputTokens: 1,
    };
    // opus-4-5: (1*15 + 1*75 + 1*1.5 + 1*18.75) / 1_000_000 = 110.25 / 1_000_000
    const cost = calculateModelCost("claude-opus-4-5", tokens);
    expect(cost).toBeCloseTo(110.25 / 1_000_000, 10);
  });
});
