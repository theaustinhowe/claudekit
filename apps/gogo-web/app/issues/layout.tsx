import type { Metadata } from "next";
import type { PropsWithChildren } from "react";

export const metadata: Metadata = { title: "Issues" };

export default function IssuesLayout({ children }: PropsWithChildren) {
  return children;
}
