import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@devkit/ui/components/sonner";
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
  description: "Your local dev tool hub for auditing, generating, and managing projects",
  icons: {
    icon: [
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/apple-icon.png",
  },
  manifest: "/site.webmanifest",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${jetbrainsMono.variable} font-sans antialiased`}>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var k="workbench-theme",o="workbench-color-scheme",m={purple:"amethyst",blue:"sapphire",green:"emerald",rose:"ruby",orange:"amber",teal:"slate"},s=localStorage.getItem(k);if(!s){var v=localStorage.getItem(o);if(v){s=m[v]||"amethyst";localStorage.setItem(k,s);localStorage.removeItem(o)}}if(s&&s!=="amethyst")document.documentElement.classList.add("theme-"+s)}catch(e){}})()`,
          }}
        />
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <LayoutShell>{children}</LayoutShell>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
