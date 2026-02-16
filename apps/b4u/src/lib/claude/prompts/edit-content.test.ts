import { describe, expect, it } from "vitest";
import { buildEditContentPrompt } from "./edit-content";

describe("buildEditContentPrompt", () => {
  it("includes the data type in prompt", () => {
    const prompt = buildEditContentPrompt("make it shorter", { title: "Test" }, "demo outline");

    expect(prompt).toContain("demo outline");
  });

  it("includes the current data as JSON", () => {
    const data = { name: "MyProject", routes: ["/home", "/about"] };
    const prompt = buildEditContentPrompt("update name", data, "project analysis");

    expect(prompt).toContain("MyProject");
    expect(prompt).toContain("/home");
    expect(prompt).toContain("/about");
  });

  it("includes the edit request", () => {
    const prompt = buildEditContentPrompt("change the title to Hello World", {}, "outline");

    expect(prompt).toContain("change the title to Hello World");
  });

  it("asks for JSON-only output", () => {
    const prompt = buildEditContentPrompt("edit", {}, "data");

    expect(prompt).toContain("only the JSON");
  });
});
