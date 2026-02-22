import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ThemeFOUCScript } from "@claudekit/hooks";
import { Toaster } from "@claudekit/ui/components/sonner";
import { ThemeProvider } from "next-themes";
import { LayoutShell } from "@/components/layout/layout-shell";
import { APP_NAME } from "@/lib/constants";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
});

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: {
    default: APP_NAME,
    template: `%s | ${APP_NAME}`,
  },
  description: "Project creation, scaffolding, and design workspace",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${jetbrainsMono.variable} font-sans antialiased`}>
        <ThemeFOUCScript />
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <LayoutShell>{children}</LayoutShell>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
