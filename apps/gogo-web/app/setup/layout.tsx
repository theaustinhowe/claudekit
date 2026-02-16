import type { Metadata } from "next";
import type { PropsWithChildren } from "react";

export const metadata: Metadata = { title: "Setup" };

export default function SetupLayout({ children }: PropsWithChildren) {
  return children;
}
