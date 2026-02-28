import { Skeleton } from "@claudekit/ui/components/skeleton";
import { ContentContainer } from "@/components/layout/content-container";

export default function SplitterLoading() {
  return (
    <ContentContainer>
      <div>
        <Skeleton className="h-8 w-32 mb-2" />
        <Skeleton className="h-4 w-72" />
      </div>

      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders
          <Skeleton key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>

      <Skeleton className="h-10 w-full rounded-lg" />
    </ContentContainer>
  );
}
