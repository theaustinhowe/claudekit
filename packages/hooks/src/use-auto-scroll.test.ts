import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAutoScroll } from "./use-auto-scroll";

beforeEach(() => {
  vi.resetAllMocks();
});

describe("useAutoScroll", () => {
  it("returns containerRef, isAtBottom, and scrollToBottom", () => {
    const { result } = renderHook(() => useAutoScroll());
    expect(result.current).toHaveProperty("containerRef");
    expect(result.current).toHaveProperty("isAtBottom");
    expect(result.current).toHaveProperty("scrollToBottom");
    expect(typeof result.current.scrollToBottom).toBe("function");
  });

  it("isAtBottom defaults to true", () => {
    const { result } = renderHook(() => useAutoScroll());
    expect(result.current.isAtBottom).toBe(true);
  });

  it("containerRef starts as null", () => {
    const { result } = renderHook(() => useAutoScroll());
    expect(result.current.containerRef.current).toBeNull();
  });

  it("scrollToBottom sets scrollTop to scrollHeight", () => {
    const { result } = renderHook(() => useAutoScroll());

    // Create a mock element and assign it to the ref
    const mockElement = document.createElement("div");
    Object.defineProperty(mockElement, "scrollHeight", { value: 1000, writable: true });
    Object.defineProperty(mockElement, "scrollTop", { value: 0, writable: true });
    Object.defineProperty(mockElement, "clientHeight", { value: 400, writable: true });

    // Manually set the ref
    (result.current.containerRef as React.MutableRefObject<HTMLDivElement | null>).current = mockElement;

    result.current.scrollToBottom();

    expect(mockElement.scrollTop).toBe(1000);
  });

  it("scrollToBottom is a no-op when ref is null", () => {
    const { result } = renderHook(() => useAutoScroll());
    // Should not throw
    expect(() => result.current.scrollToBottom()).not.toThrow();
  });

  it("accepts enabled parameter defaulting to true", () => {
    const { result: enabled } = renderHook(() => useAutoScroll(true));
    expect(enabled.current).toBeDefined();

    const { result: disabled } = renderHook(() => useAutoScroll(false));
    expect(disabled.current).toBeDefined();
  });

  it("returns stable function references across renders", () => {
    const { result, rerender } = renderHook(() => useAutoScroll());
    const firstScrollToBottom = result.current.scrollToBottom;
    rerender();
    expect(result.current.scrollToBottom).toBe(firstScrollToBottom);
  });
});
