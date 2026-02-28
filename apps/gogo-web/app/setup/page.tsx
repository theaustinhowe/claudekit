"use client";

import { SharedFooter } from "@claudekit/ui/components/shared-layout";
import { ThemeToggle } from "@claudekit/ui/components/theme-toggle";
import Image from "next/image";
import Link from "next/link";
import { SetupWizard } from "@/components/setup/setup-wizard";
import { useRepositoryContext } from "@/contexts/repository-context";

export default function SetupPage() {
  const { repositories } = useRepositoryContext();
  const hasRepos = repositories.length > 0;

  return (
    <div className="flex h-dvh flex-col bg-background">
      {/* Header */}
      <header className="bg-card/95 backdrop-blur-sm shadow-elevation-1 shrink-0 z-50">
        <div className="flex h-14 items-center justify-between px-4 md:h-16 md:px-6">
          {hasRepos ? (
            <Link href="/">
              <Image src="/logo.png" alt="GoGo" width={200} height={64} className="h-12 w-auto" />
            </Link>
          ) : (
            <Image src="/logo.png" alt="GoGo" width={200} height={64} className="h-12 w-auto" />
          )}
          <ThemeToggle />
        </div>
      </header>

      {/* Content */}
      <main className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto max-w-4xl px-4 py-4 sm:px-6">
          <div className="mb-4 text-center">
            <h1 className="text-3xl font-bold tracking-tight">{hasRepos ? "Add Repository" : "Welcome to GoGo"}</h1>
            <p className="mt-2 text-muted-foreground">
              {hasRepos
                ? "Add another repository for the agent to work on"
                : "Let's get you set up with your first repository"}
            </p>
          </div>

          <SetupWizard />
        </div>
      </main>

      <SharedFooter currentPort={2200} />
    </div>
  );
}
