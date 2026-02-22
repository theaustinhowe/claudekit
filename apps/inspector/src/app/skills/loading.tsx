import { Skeleton } from "@claudekit/ui/components/skeleton";

export default function SkillsLoading() {
  return (
    <div className="p-6 max-w-[900px] mx-auto space-y-6">
      <div>
        <Skeleton className="h-8 w-36 mb-2" />
        <Skeleton className="h-4 w-80" />
      </div>

      <div className="flex items-center gap-4">
        <Skeleton className="h-8 w-24 rounded-md" />
        <Skeleton className="h-8 w-48 rounded-md" />
      </div>

      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>

      <Skeleton className="h-10 w-full rounded-lg" />
    </div>
  );
}
