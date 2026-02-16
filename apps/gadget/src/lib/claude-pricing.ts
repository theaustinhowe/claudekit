// Anthropic API pricing per 1M tokens (USD)
// https://docs.anthropic.com/en/docs/about-claude/models

interface ModelPricing {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

const ANTHROPIC_PRICING: Record<string, ModelPricing> = {
  "claude-opus-4-5": {
    input: 15,
    output: 75,
    cacheWrite: 18.75,
    cacheRead: 1.5,
  },
  "claude-opus-4-6": {
    input: 15,
    output: 75,
    cacheWrite: 18.75,
    cacheRead: 1.5,
  },
  "claude-sonnet-4-5": {
    input: 3,
    output: 15,
    cacheWrite: 3.75,
    cacheRead: 0.3,
  },
  "claude-haiku-4-5": {
    input: 0.8,
    output: 4,
    cacheWrite: 1.0,
    cacheRead: 0.08,
  },
};

/** Normalize a full model ID like "claude-opus-4-5-20251101" to a pricing key like "claude-opus-4-5" */
function getPricingKey(modelId: string): string | null {
  // Try exact match first
  if (ANTHROPIC_PRICING[modelId]) return modelId;

  // Strip date suffix (e.g. "-20251101")
  const stripped = modelId.replace(/-\d{8}$/, "");
  if (ANTHROPIC_PRICING[stripped]) return stripped;

  // Try matching prefix
  for (const key of Object.keys(ANTHROPIC_PRICING)) {
    if (stripped.startsWith(key)) return key;
  }

  return null;
}

export interface TokenCounts {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
}

/** Calculate USD cost for a given model and token counts */
export function calculateModelCost(modelId: string, tokens: TokenCounts): number {
  const key = getPricingKey(modelId);
  if (!key) return 0;

  const pricing = ANTHROPIC_PRICING[key];
  const perToken = 1_000_000;

  return (
    (tokens.inputTokens * pricing.input) / perToken +
    (tokens.outputTokens * pricing.output) / perToken +
    (tokens.cacheCreationInputTokens * pricing.cacheWrite) / perToken +
    (tokens.cacheReadInputTokens * pricing.cacheRead) / perToken
  );
}
