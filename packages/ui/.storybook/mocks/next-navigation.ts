export function usePathname() {
  return ((globalThis as Record<string, unknown>).__STORYBOOK_PATHNAME__ as string) ?? "/";
}

export function useRouter() {
  return {
    push: () => {},
    replace: () => {},
    back: () => {},
    forward: () => {},
    refresh: () => {},
    prefetch: () => {},
  };
}

export function useSearchParams() {
  return new URLSearchParams();
}
