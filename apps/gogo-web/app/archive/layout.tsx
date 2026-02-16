import type { Metadata } from "next";
import type { PropsWithChildren } from "react";

export const metadata: Metadata = { title: "Archive" };

export default function ArchiveLayout({ children }: PropsWithChildren) {
  return children;
}
