import { Home, SearchX } from "lucide-react";
import Link from "next/link";
import { Button } from "@devkit/ui/components/button";

export default function NotFound() {
  return (
    <div className="flex h-full flex-col items-center justify-center p-8 text-center">
      <div className="mb-4 rounded-full bg-muted p-4">
        <SearchX className="h-10 w-10 text-muted-foreground" />
      </div>
      <h1 className="mb-2 text-4xl font-bold">404</h1>
      <p className="mb-6 text-lg text-muted-foreground">This page doesn't exist.</p>
      <Button asChild>
        <Link href="/">
          <Home className="h-4 w-4 mr-2" />
          Back to Dashboard
        </Link>
      </Button>
    </div>
  );
}
