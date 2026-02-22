import { ThemeToggle } from "@claudekit/ui/components/theme-toggle";
import Image from "next/image";
import Link from "next/link";

export function Header() {
  return (
    <header className="border-b px-8 py-4">
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <Image src="/logo.png" alt="ClaudeKit" width={1091} height={369} className="h-8 w-auto" />
          <span className="text-sm text-muted-foreground">Local development control center</span>
        </Link>
        <ThemeToggle />
      </div>
    </header>
  );
}
