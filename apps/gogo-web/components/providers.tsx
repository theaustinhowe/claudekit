"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { useState } from "react";
import { Toaster } from "sonner";

import { ThemeProvider } from "@/components/theme/theme-provider";
import { RepositoryProvider } from "@/contexts/repository-context";
import { WebSocketProvider } from "@/contexts/websocket-context";
import { useHealthCoordination } from "@/hooks/use-health-coordination";
import { useRepositories } from "@/hooks/use-repositories";

// Inner component that uses hooks requiring WebSocketProvider
function HealthCoordinator({ children }: { children: React.ReactNode }) {
  // Coordinates health check with WebSocket reconnection
  useHealthCoordination();
  return <>{children}</>;
}

// Inner component that provides repository context
function RepositoryLoader({ children }: { children: React.ReactNode }) {
  const { data: repositories = [], isLoading } = useRepositories();

  return (
    <RepositoryProvider repositories={repositories} isLoading={isLoading}>
      {children}
    </RepositoryProvider>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000, // 30 seconds
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <NuqsAdapter>
      <QueryClientProvider client={queryClient}>
        <WebSocketProvider>
          <HealthCoordinator>
            <RepositoryLoader>
              <ThemeProvider attribute="class" defaultTheme="system" enableSystem={true} disableTransitionOnChange>
                {children}
                <Toaster richColors position="bottom-right" duration={5000} />
              </ThemeProvider>
            </RepositoryLoader>
          </HealthCoordinator>
        </WebSocketProvider>
      </QueryClientProvider>
    </NuqsAdapter>
  );
}
