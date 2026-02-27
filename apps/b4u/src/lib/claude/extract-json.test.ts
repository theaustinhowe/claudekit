import { describe, expect, it } from "vitest";
import { extractJsonObject } from "./extract-json";

describe("extractJsonObject", () => {
  it("extracts a simple JSON object", () => {
    const input = '{"response":"Hello!","suggestedAction":null}';
    expect(extractJsonObject(input)).toBe(input);
  });

  it("extracts JSON from surrounding text", () => {
    const input = 'Some preamble text {"response":"Hello!"} trailing text';
    expect(extractJsonObject(input)).toBe('{"response":"Hello!"}');
  });

  it("handles nested braces correctly", () => {
    const input = '{"outer":{"inner":"value"}}';
    expect(extractJsonObject(input)).toBe(input);
  });

  it("respects braces inside strings", () => {
    const input = '{"msg":"Use {} for templates"}';
    expect(extractJsonObject(input)).toBe(input);
    const parsed = JSON.parse(extractJsonObject(input) as string);
    expect(parsed.msg).toBe("Use {} for templates");
  });

  it("handles braces in explanatory text before JSON", () => {
    const input =
      'The function uses curly braces { like this } for blocks.\n\nHere is the result:\n{"response":"data","count":5}';
    const result = extractJsonObject(input);
    // Should extract the first balanced JSON object, which is `{ like this }`
    // But the caller should validate the result with JSON.parse
    expect(result).not.toBeNull();
  });

  it("handles escaped quotes inside strings", () => {
    const input = '{"msg":"She said \\"hello\\""}';
    expect(extractJsonObject(input)).toBe(input);
  });

  it("returns null when no JSON is present", () => {
    expect(extractJsonObject("No JSON here")).toBeNull();
    expect(extractJsonObject("")).toBeNull();
  });

  it("returns null for unbalanced braces", () => {
    expect(extractJsonObject("{unclosed")).toBeNull();
  });

  it("extracts the first complete JSON from multiple objects", () => {
    const input = '{"first":1} {"second":2}';
    expect(extractJsonObject(input)).toBe('{"first":1}');
  });

  it("handles multiline JSON", () => {
    const input = `Here is the analysis:
{
  "name": "Test App",
  "routes": [
    {"path": "/", "title": "Home"}
  ]
}
End of response.`;
    const result = extractJsonObject(input);
    expect(result).not.toBeNull();
    const parsed = JSON.parse(result as string);
    expect(parsed.name).toBe("Test App");
    expect(parsed.routes).toHaveLength(1);
  });
});
