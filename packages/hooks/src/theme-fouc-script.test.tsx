import { describe, expect, it } from "vitest";
import { ThemeFOUCScript } from "./theme-fouc-script";

describe("ThemeFOUCScript", () => {
  it("returns a JSX element", () => {
    const element = ThemeFOUCScript({});
    expect(element).toBeTruthy();
    expect(element.type).toBe("script");
  });

  it("includes the default storage key in the script", () => {
    const element = ThemeFOUCScript({});
    const html = element.props.dangerouslySetInnerHTML.__html as string;
    expect(html).toContain("devkit-theme");
  });

  it("uses custom storage key when provided", () => {
    const element = ThemeFOUCScript({ storageKey: "my-app-theme" });
    const html = element.props.dangerouslySetInnerHTML.__html as string;
    expect(html).toContain("my-app-theme");
    expect(html).not.toContain("devkit-theme");
  });

  it("script reads from localStorage and adds theme class", () => {
    const element = ThemeFOUCScript({});
    const html = element.props.dangerouslySetInnerHTML.__html as string;
    expect(html).toContain("localStorage.getItem");
    expect(html).toContain("classList.add");
  });

  it("script skips amethyst theme (default)", () => {
    const element = ThemeFOUCScript({});
    const html = element.props.dangerouslySetInnerHTML.__html as string;
    expect(html).toContain("amethyst");
  });
});
