import { ThemeFOUCScript } from "@claudekit/hooks";
import { Toaster } from "@claudekit/ui/components/sonner";
import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import { Header } from "@/components/header";
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-background text-foreground antialiased">
        <ThemeFOUCScript />
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          <Header />
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
