import { Skeleton } from "@claudekit/ui/components/skeleton";
import { ContentContainer } from "@/components/layout/content-container";

export default function SkillsLoading() {
  return (
    <ContentContainer>
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-8 w-36 mb-2" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-9 w-36 rounded-md" />
      </div>

      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders
          <Skeleton key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>
    </ContentContainer>
  );
}
