import { useState } from "react";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return children;
}

export function useTheme() {
  const [theme, setTheme] = useState("light");
  return { theme, setTheme, resolvedTheme: theme, themes: ["light", "dark", "system"], systemTheme: "light" };
}
