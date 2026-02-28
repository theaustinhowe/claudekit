import { Skeleton } from "@claudekit/ui/components/skeleton";

export default function AnalysisDashboardLoading() {
  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24 rounded-md" />
          <Skeleton className="h-9 w-24 rounded-md" />
          <Skeleton className="h-9 w-32 rounded-md" />
          <Skeleton className="h-9 w-32 rounded-md" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders
          <Skeleton key={i} className="h-40 w-full rounded-lg" />
        ))}
      </div>
    </>
  );
}
