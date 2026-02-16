import type { Metadata } from "next";
import type { PropsWithChildren } from "react";

export const metadata: Metadata = { title: "Health" };

export default function HealthLayout({ children }: PropsWithChildren) {
  return children;
}
