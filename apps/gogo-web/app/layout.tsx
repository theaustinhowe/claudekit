import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeFOUCScript } from "@claudekit/hooks";
import { ClientLayout } from "@/components/layout/client-layout";
import { Providers } from "@/components/providers";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "Dashboard | GoGo",
    template: "%s | GoGo",
  },
  description: "GitHub Issue to PR Orchestrator",
  icons: {
    icon: [{ url: "/icon.png", type: "image/png" }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeFOUCScript />
        <Providers>
          <ClientLayout>{children}</ClientLayout>
        </Providers>
      </body>
    </html>
  );
}
