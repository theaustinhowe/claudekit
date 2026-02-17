import Link from "next/link";
import { Button } from "./button";

export function NotFoundPage({
  returnLabel = "Return to Dashboard",
  returnHref = "/",
}: {
  returnLabel?: string;
  returnHref?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-6">
      <h1 className="text-6xl font-bold text-muted-foreground mb-4">404</h1>
      <p className="text-xl text-muted-foreground mb-8">Page not found</p>
      <Link href={returnHref}>
        <Button>{returnLabel}</Button>
      </Link>
    </div>
  );
}
