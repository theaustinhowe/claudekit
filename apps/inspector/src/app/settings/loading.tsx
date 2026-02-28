import { Skeleton } from "@claudekit/ui/components/skeleton";

export default function SettingsLoading() {
  return (
    <>
      <div className="flex h-12 shrink-0 items-center gap-1 border-b bg-background px-4">
        <Skeleton className="h-6 w-16 rounded" />
        <Skeleton className="h-6 w-20 rounded" />
        <Skeleton className="h-6 w-24 rounded" />
      </div>
      <div className="max-w-5xl mx-auto w-full p-6 space-y-4">
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-32 w-full rounded-lg" />
        <Skeleton className="h-20 w-full rounded-lg" />
      </div>
    </>
  );
}
