"use client";

import { Skeleton } from "@devkit/ui/components/skeleton";

export function Phase1TreeSkeleton() {
  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b border-border bg-card">
        <Skeleton className="h-4 w-[140px]" />
      </div>
      <div className="flex-1 p-4 space-y-1.5">
        <Skeleton className="h-4 w-[180px]" />
        <Skeleton className="h-4 w-[160px] ml-4" />
        <Skeleton className="h-4 w-[200px] ml-4" />
        <Skeleton className="h-4 w-[140px] ml-8" />
        <Skeleton className="h-4 w-[170px] ml-8" />
        <Skeleton className="h-4 w-[120px] ml-8" />
        <Skeleton className="h-4 w-[150px] ml-4" />
        <Skeleton className="h-4 w-[190px] ml-8" />
        <Skeleton className="h-4 w-[160px] ml-8" />
        <Skeleton className="h-4 w-[130px] ml-4" />
      </div>
      <div className="px-4 py-2 border-t border-border">
        <Skeleton className="h-3 w-[120px]" />
      </div>
    </div>
  );
}

export function Phase2OutlineSkeleton() {
  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b border-border flex gap-4 bg-card">
        <Skeleton className="h-6 w-[80px] rounded-sm" />
        <Skeleton className="h-6 w-[100px] rounded-sm" />
      </div>
      <div className="flex-1 p-2">
        <div className="grid grid-cols-[1fr_1fr_60px_2fr] gap-2 px-3 py-2">
          <Skeleton className="h-3 w-[30px]" />
          <Skeleton className="h-3 w-[30px]" />
          <Skeleton className="h-3 w-[24px]" />
          <Skeleton className="h-3 w-[60px]" />
        </div>
        {["a", "b", "c", "d", "e"].map((k) => (
          <div key={k} className="grid grid-cols-[1fr_1fr_60px_2fr] gap-2 px-3 py-2.5">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-[36px] rounded-sm" />
            <Skeleton className="h-4 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function Phase3DataPlanSkeleton() {
  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b border-border bg-card">
        <Skeleton className="h-4 w-[160px]" />
      </div>
      <div className="flex-1 p-4 space-y-4">
        <div>
          <Skeleton className="h-3 w-[70px] mb-2" />
          <div className="space-y-0 border border-border rounded-md overflow-hidden">
            {["a", "b", "c"].map((k) => (
              <div key={k} className="flex items-center gap-3 px-3 py-2.5 border-b border-border">
                <Skeleton className="h-5 w-[24px]" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-[120px] mb-1" />
                  <Skeleton className="h-3 w-[180px]" />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <Skeleton className="h-3 w-[90px] mb-2" />
          <div className="space-y-0 border border-border rounded-md overflow-hidden">
            {["a", "b"].map((k) => (
              <div key={k} className="flex items-center justify-between px-3 py-2.5 border-b border-border">
                <Skeleton className="h-4 w-[140px]" />
                <Skeleton className="h-4 w-[32px] rounded-full" />
              </div>
            ))}
          </div>
        </div>
        <div>
          <Skeleton className="h-3 w-[80px] mb-2" />
          <div className="space-y-0 border border-border rounded-md overflow-hidden">
            {["a", "b"].map((k) => (
              <div key={k} className="flex items-center justify-between px-3 py-2.5 border-b border-border">
                <Skeleton className="h-4 w-[160px]" />
                <Skeleton className="h-4 w-[32px] rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function Phase4ScriptsSkeleton() {
  return (
    <div className="h-full flex flex-col">
      <div className="flex border-b border-border bg-card px-2 py-1">
        <Skeleton className="h-7 w-[80px] mx-1 rounded-sm" />
        <Skeleton className="h-7 w-[90px] mx-1 rounded-sm" />
        <Skeleton className="h-7 w-[70px] mx-1 rounded-sm" />
      </div>
      <div className="flex-1 p-4">
        <div className="relative">
          <div className="absolute left-[11px] top-[16px] bottom-[16px] w-[1px] bg-border" />
          <div className="space-y-4">
            {["a", "b", "c", "d"].map((k) => (
              <div key={k} className="flex gap-3">
                <Skeleton className="w-[22px] h-[22px] rounded-full shrink-0" />
                <div className="flex-1 space-y-2 pb-4 border-b border-border">
                  <div className="flex gap-2">
                    <Skeleton className="h-5 w-[60px] rounded-sm" />
                    <Skeleton className="h-5 w-[30px]" />
                  </div>
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-3 w-[70%]" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="px-4 py-2 border-t border-border">
        <Skeleton className="h-3 w-[200px]" />
      </div>
    </div>
  );
}

export function Phase5RecordingSkeleton() {
  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b border-border bg-card">
        <Skeleton className="h-4 w-[160px]" />
      </div>
      <div className="flex-1 p-4 space-y-4">
        <div>
          <div className="flex justify-between mb-1">
            <Skeleton className="h-3 w-[50px]" />
            <Skeleton className="h-3 w-[30px]" />
          </div>
          <Skeleton className="h-[4px] w-full rounded-full" />
        </div>
        {["a", "b", "c"].map((k) => (
          <div key={k} className="p-3 border border-border rounded-md">
            <div className="flex justify-between mb-2">
              <Skeleton className="h-4 w-[120px]" />
              <Skeleton className="h-5 w-[60px] rounded-sm" />
            </div>
            <Skeleton className="h-[3px] w-full rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function Phase6VoiceoverSkeleton() {
  return (
    <div className="h-full flex flex-col">
      <div className="flex border-b border-border bg-card px-2 py-1">
        <Skeleton className="h-7 w-[80px] mx-1 rounded-sm" />
        <Skeleton className="h-7 w-[90px] mx-1 rounded-sm" />
      </div>
      <div className="flex-1 flex flex-col">
        <div className="p-4 border-b border-border">
          <Skeleton className="h-3 w-[50px] mb-2" />
          <Skeleton className="h-[48px] w-full rounded-md" />
        </div>
        <div className="flex items-center gap-3 px-4 py-2 border-b border-border">
          <Skeleton className="h-6 w-[80px]" />
          <Skeleton className="h-4 w-[100px]" />
          <Skeleton className="ml-auto h-7 w-[100px] rounded-sm" />
        </div>
        <div className="flex-1 p-4 space-y-3">
          <div className="flex justify-between">
            <Skeleton className="h-3 w-[100px]" />
            <Skeleton className="h-3 w-[60px]" />
          </div>
          {["a", "b", "c"].map((k) => (
            <div key={k} className="p-3.5 border border-border rounded-md space-y-2">
              <div className="flex gap-2">
                <Skeleton className="h-3 w-[20px]" />
                <Skeleton className="h-3 w-[40px]" />
              </div>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-[80%]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Phase7OutputSkeleton() {
  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b border-border bg-card">
        <Skeleton className="h-4 w-[100px]" />
      </div>
      <div className="flex-1 p-4 space-y-4">
        <div className="border border-border rounded-lg overflow-hidden">
          <Skeleton className="aspect-video w-full" />
          <div className="flex items-center gap-3 px-3 py-2.5 border-t border-border">
            <Skeleton className="w-[24px] h-[24px]" />
            <Skeleton className="flex-1 h-[3px] rounded-full" />
            <Skeleton className="w-[60px] h-3" />
            <Skeleton className="w-[24px] h-[24px]" />
          </div>
        </div>
        <div>
          <Skeleton className="h-3 w-[60px] mb-2" />
          <div className="space-y-1.5">
            {["a", "b", "c"].map((k) => (
              <Skeleton key={k} className="h-10 w-full rounded-md" />
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-[120px] rounded-md" />
          <Skeleton className="h-9 w-[120px] rounded-md" />
          <Skeleton className="h-9 w-[100px] rounded-md" />
        </div>
      </div>
    </div>
  );
}
