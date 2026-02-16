import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";

export function Header() {
  return (
    <header className="border-b px-8 py-4">
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-gradient">ClaudeKit</h1>
          <span className="text-sm text-muted-foreground">Local development control center</span>
        </Link>
        <ThemeToggle />
      </div>
    </header>
  );
}
