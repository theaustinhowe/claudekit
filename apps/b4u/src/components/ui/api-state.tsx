"use client";

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="h-full flex items-center justify-center p-4">
      <div className="text-center">
        <div className="text-xs mb-1 text-destructive">Failed to load data</div>
        <div className="text-2xs mb-3 text-muted-foreground">{message}</div>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="px-3 py-1.5 text-2xs font-medium transition-colors bg-muted border rounded-md text-foreground"
            style={{
              borderColor: "hsl(var(--foreground) / 0.2)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "hsl(var(--primary))";
              e.currentTarget.style.color = "hsl(var(--primary))";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "hsl(var(--foreground) / 0.2)";
              e.currentTarget.style.color = "";
            }}
          >
            Retry
          </button>
        )}
      </div>
    </div>
  );
}
