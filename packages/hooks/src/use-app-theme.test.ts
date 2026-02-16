import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ThemeDefinition } from "./use-app-theme";
import { THEMES, useAppTheme } from "./use-app-theme";

// --- localStorage mock -------------------------------------------------------

const mockStorage = new Map<string, string>();

beforeEach(() => {
  vi.resetAllMocks();
  mockStorage.clear();
  document.documentElement.className = "";

  Object.defineProperty(window, "localStorage", {
    value: {
      getItem: (key: string) => mockStorage.get(key) ?? null,
      setItem: (key: string, value: string) => mockStorage.set(key, value),
      removeItem: (key: string) => mockStorage.delete(key),
    },
    writable: true,
  });
});

// --- THEMES constant ---------------------------------------------------------

describe("THEMES constant", () => {
  it("has exactly 9 themes", () => {
    expect(THEMES).toHaveLength(9);
  });

  it("has unique ids", () => {
    const ids = THEMES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every theme has the required shape", () => {
    for (const theme of THEMES) {
      expect(theme).toMatchObject({
        id: expect.any(String),
        label: expect.any(String),
        description: expect.any(String),
        hue: expect.any(Number),
      } satisfies Record<keyof ThemeDefinition, unknown>);
    }
  });

  it("first theme is amethyst", () => {
    expect(THEMES[0].id).toBe("amethyst");
  });

  it("includes all expected theme ids", () => {
    const ids = THEMES.map((t) => t.id);
    const expected = ["amethyst", "sapphire", "emerald", "ruby", "amber", "slate", "midnight", "sunset", "forest"];
    expect(ids).toEqual(expected);
  });
});

// --- useAppTheme hook --------------------------------------------------------

describe("useAppTheme", () => {
  it("returns amethyst as the default theme", () => {
    const { result } = renderHook(() => useAppTheme());
    expect(result.current.theme).toBe("amethyst");
  });

  it("returns all themes", () => {
    const { result } = renderHook(() => useAppTheme());
    expect(result.current.themes).toBe(THEMES);
  });

  it("returns currentTheme matching the active theme", () => {
    const { result } = renderHook(() => useAppTheme());
    expect(result.current.currentTheme.id).toBe("amethyst");
  });

  it("sets mounted to true after effect", () => {
    const { result } = renderHook(() => useAppTheme());
    expect(result.current.mounted).toBe(true);
  });

  it("reads stored theme from localStorage on mount", () => {
    mockStorage.set("devkit-theme", "ruby");
    const { result } = renderHook(() => useAppTheme());
    expect(result.current.theme).toBe("ruby");
  });

  it("applies CSS class for non-amethyst stored theme", () => {
    mockStorage.set("devkit-theme", "emerald");
    renderHook(() => useAppTheme());
    expect(document.documentElement.classList.contains("theme-emerald")).toBe(true);
  });

  it("does not apply CSS class for amethyst (default)", () => {
    mockStorage.set("devkit-theme", "amethyst");
    renderHook(() => useAppTheme());
    expect(document.documentElement.className).toBe("");
  });

  it("writes theme to localStorage when setTheme is called", () => {
    const { result } = renderHook(() => useAppTheme());
    act(() => {
      result.current.setTheme("sapphire");
    });
    expect(mockStorage.get("devkit-theme")).toBe("sapphire");
    expect(result.current.theme).toBe("sapphire");
  });

  it("applies CSS class when switching themes", () => {
    const { result } = renderHook(() => useAppTheme());
    act(() => {
      result.current.setTheme("midnight");
    });
    expect(document.documentElement.classList.contains("theme-midnight")).toBe(true);
  });

  it("removes previous theme class when switching", () => {
    const { result } = renderHook(() => useAppTheme());
    act(() => {
      result.current.setTheme("midnight");
    });
    act(() => {
      result.current.setTheme("forest");
    });
    expect(document.documentElement.classList.contains("theme-midnight")).toBe(false);
    expect(document.documentElement.classList.contains("theme-forest")).toBe(true);
  });

  it("removes theme class when switching back to amethyst", () => {
    const { result } = renderHook(() => useAppTheme());
    act(() => {
      result.current.setTheme("sunset");
    });
    expect(document.documentElement.classList.contains("theme-sunset")).toBe(true);
    act(() => {
      result.current.setTheme("amethyst");
    });
    expect(document.documentElement.classList.contains("theme-sunset")).toBe(false);
    expect(document.documentElement.classList.contains("theme-amethyst")).toBe(false);
  });

  it("ignores invalid stored theme values", () => {
    mockStorage.set("devkit-theme", "nonexistent-theme");
    const { result } = renderHook(() => useAppTheme());
    expect(result.current.theme).toBe("amethyst");
  });

  // --- custom storageKey ---

  it("uses a custom storageKey", () => {
    mockStorage.set("my-custom-key", "amber");
    const { result } = renderHook(() => useAppTheme({ storageKey: "my-custom-key" }));
    expect(result.current.theme).toBe("amber");
  });

  it("writes to custom storageKey on setTheme", () => {
    const { result } = renderHook(() => useAppTheme({ storageKey: "my-key" }));
    act(() => {
      result.current.setTheme("slate");
    });
    expect(mockStorage.get("my-key")).toBe("slate");
    expect(mockStorage.has("devkit-theme")).toBe(false);
  });

  // --- defaultTheme ---

  it("uses provided defaultTheme", () => {
    const { result } = renderHook(() => useAppTheme({ defaultTheme: "ruby" }));
    // Before mount effect reads localStorage, state is the defaultTheme
    expect(result.current.theme).toBe("ruby");
  });

  it("currentTheme reflects the active selection after switching", () => {
    const { result } = renderHook(() => useAppTheme());
    act(() => {
      result.current.setTheme("sunset");
    });
    expect(result.current.currentTheme.id).toBe("sunset");
    expect(result.current.currentTheme.label).toBe("Sunset");
  });
});
