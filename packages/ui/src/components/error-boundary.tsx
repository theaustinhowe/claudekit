"use client";

import { Component, type ReactNode } from "react";
import { Button } from "./button";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackLabel?: string;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
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
            <Button variant="outline" size="sm" onClick={this.handleReset}>
              Try again
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
