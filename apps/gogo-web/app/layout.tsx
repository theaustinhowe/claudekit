import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeFOUCScript } from "@devkit/hooks";
import { ClientLayout } from "@/components/layout/client-layout";
import { Providers } from "@/components/providers";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "Dashboard | GoGo",
    template: "%s | GoGo",
  },
  description: "GitHub Issue to PR Orchestrator",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeFOUCScript legacyKeys={["gogo-theme"]} />
        <Providers>
          <ClientLayout>{children}</ClientLayout>
        </Providers>
      </body>
    </html>
  );
}
