import { Button } from "@claudekit/ui/components/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function AnalysisNotFound() {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 gap-4">
      <h1 className="text-2xl font-bold">Analysis Not Found</h1>
      <p className="text-muted-foreground">This analysis doesn't exist or may have been deleted.</p>
      <Button variant="outline" asChild>
        <Link href="/skills">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Skills
        </Link>
      </Button>
    </div>
  );
}
