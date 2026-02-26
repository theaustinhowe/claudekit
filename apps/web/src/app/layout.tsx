import { existsSync } from "node:fs";
import { join } from "node:path";
import { ThemeFOUCScript } from "@claudekit/hooks";
import { Toaster } from "@claudekit/ui/components/sonner";
import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import { Header } from "@/components/header";
import { HeaderActions } from "@/components/header-actions";
import { readToolboxSettings } from "@/lib/toolbox-settings";
import "./globals.css";

export const metadata: Metadata = {
  title: "ClaudeKit",
  description: "Local development control center",
  icons: {
    icon: [
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/apple-icon.png",
  },
  manifest: "/site.webmanifest",
};

export const dynamic = "force-dynamic";

function checkNeedsSetup(): boolean {
  let dir = process.cwd();
  for (;;) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) {
      return !existsSync(join(dir, ".env.local"));
    }
    const parent = join(dir, "..");
    if (parent === dir) return false;
    dir = parent;
  }
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const needsSetup = checkNeedsSetup();
  const toolboxToolIds = readToolboxSettings();

  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-background text-foreground antialiased">
        <ThemeFOUCScript />
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          <Header actions={<HeaderActions autoOpen={needsSetup} toolboxToolIds={toolboxToolIds} />} />
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
