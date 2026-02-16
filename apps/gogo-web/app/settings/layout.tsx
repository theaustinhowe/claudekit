import type { Metadata } from "next";
import type { PropsWithChildren } from "react";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsLayout({ children }: PropsWithChildren) {
  return children;
}
