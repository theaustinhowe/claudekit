import type { ReactNode } from "react";

export function ContentBanner({ children }: { children: ReactNode }) {
  return <div className="border-b bg-background">{children}</div>;
}
