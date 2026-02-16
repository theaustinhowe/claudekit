import { ThemeFOUCScript } from "@devkit/hooks";
import { Toaster } from "@devkit/ui/components/sonner";
import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import { Header } from "@/components/header";
import "./globals.css";

export const metadata: Metadata = {
  title: "ClaudeKit",
  description: "Local development control center",
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
