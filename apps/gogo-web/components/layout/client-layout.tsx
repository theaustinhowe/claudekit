"use client";

import { AppShell } from "./app-shell";

interface ClientLayoutProps {
  children: React.ReactNode;
}

export function ClientLayout({ children }: ClientLayoutProps) {
  return <AppShell>{children}</AppShell>;
}
