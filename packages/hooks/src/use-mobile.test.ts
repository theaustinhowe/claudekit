import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useIsMobile } from "./use-mobile";

let changeHandler: (() => void) | null = null;

beforeEach(() => {
  vi.resetAllMocks();
  changeHandler = null;

  Object.defineProperty(window, "innerWidth", { value: 1024, writable: true });

  Object.defineProperty(window, "matchMedia", {
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: (_event: string, handler: () => void) => {
        changeHandler = handler;
      },
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
    writable: true,
  });
});

describe("useIsMobile", () => {
  it("returns false for desktop width (>=768)", () => {
    Object.defineProperty(window, "innerWidth", { value: 1024, writable: true });
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it("returns true for mobile width (<768)", () => {
    Object.defineProperty(window, "innerWidth", { value: 500, writable: true });
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it("returns true at width 767 (just below breakpoint)", () => {
    Object.defineProperty(window, "innerWidth", { value: 767, writable: true });
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it("returns false at width 768 (exactly at breakpoint)", () => {
    Object.defineProperty(window, "innerWidth", { value: 768, writable: true });
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it("responds to media query change events", () => {
    Object.defineProperty(window, "innerWidth", { value: 1024, writable: true });
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);

    // Simulate resize to mobile
    Object.defineProperty(window, "innerWidth", { value: 500, writable: true });
    act(() => {
      changeHandler?.();
    });
    expect(result.current).toBe(true);

    // Simulate resize back to desktop
    Object.defineProperty(window, "innerWidth", { value: 1024, writable: true });
    act(() => {
      changeHandler?.();
    });
    expect(result.current).toBe(false);
  });

  it("calls matchMedia with the correct query", () => {
    renderHook(() => useIsMobile());
    expect(window.matchMedia).toHaveBeenCalledWith("(max-width: 767px)");
  });

  it("removes event listener on unmount", () => {
    const removeEventListener = vi.fn();
    Object.defineProperty(window, "matchMedia", {
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: (_event: string, handler: () => void) => {
          changeHandler = handler;
        },
        removeEventListener,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
      writable: true,
    });

    const { unmount } = renderHook(() => useIsMobile());
    unmount();

    expect(removeEventListener).toHaveBeenCalledWith("change", expect.any(Function));
  });

  it("starts with false on initial render (SSR default)", () => {
    Object.defineProperty(window, "innerWidth", { value: 500, writable: true });
    // Before the effect runs, the initial state is false
    // After the effect runs, it will be updated to true based on window.innerWidth
    const { result } = renderHook(() => useIsMobile());
    // After mounting, the effect has run and updated the state
    expect(result.current).toBe(true);
  });

  it("handles multiple rapid resize events", () => {
    Object.defineProperty(window, "innerWidth", { value: 1024, writable: true });
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);

    // Rapid resize to mobile then desktop then mobile
    act(() => {
      Object.defineProperty(window, "innerWidth", { value: 500, writable: true });
      changeHandler?.();
    });
    expect(result.current).toBe(true);

    act(() => {
      Object.defineProperty(window, "innerWidth", { value: 800, writable: true });
      changeHandler?.();
    });
    expect(result.current).toBe(false);

    act(() => {
      Object.defineProperty(window, "innerWidth", { value: 200, writable: true });
      changeHandler?.();
    });
    expect(result.current).toBe(true);
  });
});
