"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchSettings, updateSettings } from "@/lib/api";

// Query key for settings
export const settingsKeys = {
  all: ["settings"] as const,
};

// Fetch all settings
export function useSettings() {
  return useQuery({
    queryKey: settingsKeys.all,
    queryFn: async () => {
      const response = await fetchSettings();
      return response.data;
    },
  });
}

// Update settings mutation
export function useUpdateSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (settings: Record<string, unknown>) => updateSettings(settings),
    onSuccess: (response) => {
      // Update the cache with the new settings
      queryClient.setQueryData(settingsKeys.all, (old: Record<string, unknown> | undefined) => ({
        ...old,
        ...response.data,
      }));
    },
  });
}
