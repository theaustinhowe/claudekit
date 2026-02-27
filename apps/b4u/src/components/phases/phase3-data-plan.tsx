"use client";

import { cn } from "@claudekit/ui";
import { useCallback, useEffect, useState } from "react";
import { ErrorState } from "@/components/ui/api-state";
import { Phase3DataPlanSkeleton } from "@/components/ui/phase-skeletons";
import { useApp } from "@/lib/store";
import type { AuthOverride, EnvItem, MockDataEntity } from "@/lib/types";
import { useApi } from "@/lib/use-api";
import { uid } from "@/lib/utils";
import { PhaseGoalBanner } from "./phase-goal-banner";

export function Phase3DataPlan() {
  const { state, dispatch } = useApp();
  const {
    data: apiEntities,
    loading: l1,
    error: e1,
    refetch: r1,
  } = useApi<MockDataEntity[]>(`/api/mock-data-entities?runId=${state.runId}`, state.panelRefreshKey);
  const {
    data: apiAuth,
    loading: l2,
    error: e2,
    refetch: r2,
  } = useApi<AuthOverride[]>(`/api/auth-overrides?runId=${state.runId}`, state.panelRefreshKey);
  const {
    data: apiEnv,
    loading: l3,
    error: e3,
    refetch: r3,
  } = useApi<EnvItem[]>(`/api/env-config?runId=${state.runId}`, state.panelRefreshKey);

  const [authOverrides, setAuthOverrides] = useState<AuthOverride[]>([]);
  const [envItems, setEnvItems] = useState<EnvItem[]>([]);

  const notifyChange = useCallback(
    (message: string) => {
      dispatch({
        type: "ADD_THREAD_MESSAGE",
        phase: 3,
        message: { id: uid(), role: "system", content: message, timestamp: Date.now() },
      });
    },
    [dispatch],
  );

  useEffect(() => {
    if (apiAuth) setAuthOverrides(apiAuth);
  }, [apiAuth]);

  useEffect(() => {
    if (apiEnv) setEnvItems(apiEnv);
  }, [apiEnv]);

  const persistAuthToggle = useCallback(
    async (id: string, enabled: boolean) => {
      try {
        await fetch("/api/auth-overrides", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, enabled, runId: state.runId }),
        });
      } catch (err) {
        console.error("Failed to persist auth override:", err);
      }
    },
    [state.runId],
  );

  const persistEnvToggle = useCallback(
    async (id: string, enabled: boolean) => {
      try {
        await fetch("/api/env-config", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, enabled, runId: state.runId }),
        });
      } catch (err) {
        console.error("Failed to persist env config:", err);
      }
    },
    [state.runId],
  );

  if (l1 && l2 && l3) return <Phase3DataPlanSkeleton />;

  const toggleAuth = (id: string) => {
    setAuthOverrides((prev) => {
      const updated = prev.map((a) => (a.id === id ? { ...a, enabled: !a.enabled } : a));
      const item = updated.find((a) => a.id === id);
      if (item) {
        persistAuthToggle(id, item.enabled);
        notifyChange(`Auth override "${item.label}" ${item.enabled ? "enabled" : "disabled"}`);
      }
      return updated;
    });
  };

  const toggleEnv = (id: string) => {
    setEnvItems((prev) => {
      const updated = prev.map((e) => (e.id === id ? { ...e, enabled: !e.enabled } : e));
      const item = updated.find((e) => e.id === id);
      if (item) {
        persistEnvToggle(id, item.enabled);
        notifyChange(`Environment "${item.label}" ${item.enabled ? "enabled" : "disabled"}`);
      }
      return updated;
    });
  };

  return (
    <div className="h-full flex flex-col animate-slide-in-right">
      <PhaseGoalBanner phase={3} />
      <div className="px-4 py-3 border-b border-border text-xs font-medium flex items-center gap-2 text-muted-foreground bg-card">
        <span className="text-primary">◊</span>
        DATA & ENVIRONMENT PLAN
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Mock Data section */}
        <section>
          <div className="text-2xs font-medium mb-2 text-muted-foreground">MOCK DATA</div>
          {l1 ? (
            <SectionSkeleton />
          ) : e1 || !apiEntities ? (
            <ErrorState message={e1 || "No data"} onRetry={r1} />
          ) : (
            <div className="divide-y bg-card border border-border rounded-md overflow-hidden">
              {apiEntities.map((entity) => (
                <div key={entity.name} className="flex items-center justify-between px-3 py-2">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-medium w-[24px] text-center text-primary">{entity.count}</span>
                    <div>
                      <div className="text-xs text-foreground">{entity.name}</div>
                      <div className="text-2xs text-muted-foreground/70">{entity.note}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Auth Overrides */}
        <section>
          <div className="text-2xs font-medium mb-2 text-muted-foreground">AUTH OVERRIDES</div>
          {l2 ? (
            <SectionSkeleton />
          ) : e2 ? (
            <ErrorState message={e2} onRetry={r2} />
          ) : (
            <div className="space-y-0 bg-card border border-border rounded-md overflow-hidden">
              {authOverrides.map((item) => (
                <div key={item.id} className="flex items-center justify-between px-3 py-2 border-b border-border">
                  <span className="text-xs text-muted-foreground">{item.label}</span>
                  <ToggleSwitch enabled={item.enabled} onToggle={() => toggleAuth(item.id)} />
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Environment */}
        <section>
          <div className="text-2xs font-medium mb-2 text-muted-foreground">ENVIRONMENT</div>
          {l3 ? (
            <SectionSkeleton />
          ) : e3 ? (
            <ErrorState message={e3} onRetry={r3} />
          ) : (
            <div className="space-y-0 bg-card border border-border rounded-md overflow-hidden">
              {envItems.map((item) => (
                <div key={item.id} className="flex items-center justify-between px-3 py-2 border-b border-border">
                  <span className="text-xs text-muted-foreground">{item.label}</span>
                  <ToggleSwitch enabled={item.enabled} onToggle={() => toggleEnv(item.id)} />
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function SectionSkeleton() {
  return (
    <div className="bg-card border border-border rounded-md overflow-hidden">
      {Array.from({ length: 3 }).map((_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholder
        <div key={i} className="flex items-center gap-3 px-3 py-2.5 border-b border-border last:border-b-0">
          <div className="h-3 w-20 bg-muted animate-pulse rounded" />
        </div>
      ))}
    </div>
  );
}

function ToggleSwitch({ enabled, onToggle, disabled }: { enabled: boolean; onToggle: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={enabled ? "Enabled" : "Disabled"}
      onClick={disabled ? undefined : onToggle}
      onKeyDown={(e) => {
        if (!disabled && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onToggle();
        }
      }}
      className={cn(
        "relative shrink-0 w-[32px] h-[18px] rounded-full border transition-colors",
        disabled && "opacity-50 cursor-default",
        !disabled && "cursor-pointer",
        enabled && !disabled && "bg-primary border-primary",
        !enabled && !disabled && "bg-muted border-border",
        disabled && "bg-muted border-border",
      )}
    >
      <div
        className={cn(
          "absolute top-[2px] w-[12px] h-[12px] rounded-full transition-all",
          enabled ? "left-[16px] bg-background" : "left-[2px] bg-muted-foreground",
          disabled && "bg-muted-foreground",
        )}
      />
    </button>
  );
}
