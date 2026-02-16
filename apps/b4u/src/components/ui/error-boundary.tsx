"use client";

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallbackLabel?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-full flex items-center justify-center p-6">
          <div className="text-center max-w-[320px] bg-secondary border border-border rounded-lg p-6">
            <div className="text-sm font-medium mb-2 text-destructive">Something went wrong</div>
            {this.props.fallbackLabel && (
              <div className="text-2xs mb-2 text-muted-foreground">{this.props.fallbackLabel}</div>
            )}
            <div className="text-2xs mb-4 break-words text-muted-foreground/70">
              {this.state.error?.message || "An unexpected error occurred"}
            </div>
            <button
              type="button"
              onClick={this.handleReset}
              className="px-4 py-2 text-xs font-medium transition-colors bg-muted border border-border rounded-md text-foreground"
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
              Try again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
