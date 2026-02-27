"use client";

export function ErrorState({
  message,
  onRetry,
  guidance,
}: {
  message: string;
  onRetry?: () => void;
  guidance?: string;
}) {
  return (
    <div className="h-full flex items-center justify-center p-4">
      <div className="text-center">
        <div className="text-xs mb-1 text-destructive">Failed to load data</div>
        <div className="text-2xs mb-3 text-muted-foreground">{message}</div>
        {guidance && <div className="text-2xs mb-3 text-muted-foreground/70">{guidance}</div>}
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="px-3 py-1.5 text-2xs font-medium transition-colors bg-muted border border-foreground/20 rounded-md text-foreground hover:border-primary hover:text-primary"
          >
            Retry
          </button>
        )}
      </div>
    </div>
  );
}
