/**
 * Balanced bracket-counting JSON extractor.
 * Finds the first balanced `{}` pair, respecting strings.
 * Replaces the greedy regex `/{[\s\S]*}/` which matches first `{` to LAST `}`.
 */
export function extractJsonObject(input: string): string | null {
  let start = -1;
  let depth = 0;
  let inString = false;
  let isEscaped = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if (isEscaped) {
      isEscaped = false;
      continue;
    }

    if (ch === "\\") {
      isEscaped = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && start !== -1) {
        return input.slice(start, i + 1);
      }
    }
  }

  return null;
}
