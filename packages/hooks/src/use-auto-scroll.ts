"use client";

import { useCallback, useEffect, useRef } from "react";

const SCROLL_THRESHOLD = 100;

interface UseAutoScrollResult {
  containerRef: React.RefObject<HTMLDivElement | null>;
  isAtBottom: boolean;
  scrollToBottom: () => void;
}

export function useAutoScroll(enabled: boolean = true): UseAutoScrollResult {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isAtBottomRef = useRef(true);
  const userScrolledRef = useRef(false);

  const checkIfAtBottom = useCallback(() => {
    const el = containerRef.current;
    if (!el) return true;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    return distanceFromBottom < SCROLL_THRESHOLD;
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    isAtBottomRef.current = true;
    userScrolledRef.current = false;
  }, []);

  // Handle user scroll events
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onScroll = () => {
      const atBottom = checkIfAtBottom();
      isAtBottomRef.current = atBottom;
      if (!atBottom) {
        userScrolledRef.current = true;
      } else {
        userScrolledRef.current = false;
      }
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [checkIfAtBottom]);

  // Auto-scroll when content changes (via MutationObserver)
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !enabled) return;

    const observer = new MutationObserver(() => {
      if (isAtBottomRef.current && !userScrolledRef.current) {
        el.scrollTop = el.scrollHeight;
      }
    });

    observer.observe(el, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [enabled]);

  return {
    containerRef,
    isAtBottom: isAtBottomRef.current,
    scrollToBottom,
  };
}
