"use client";

import { useCallback, useEffect, useState } from "react";
import { ErrorState } from "@/components/ui/api-state";
import { Phase3DataPlanSkeleton } from "@/components/ui/phase-skeletons";
import { useApp } from "@/lib/store";
import type { AuthOverride, EnvItem, MockDataEntity } from "@/lib/types";
import { useApi } from "@/lib/use-api";
import { uid } from "@/lib/utils";

export function Phase3DataPlan() {
  const { state, dispatch } = useApp();
  const {
    data: apiEntities,
    loading: l1,
    error: e1,
    refetch: r1,
  } = useApi<MockDataEntity[]>(`/api/mock-data-entities?runId=${state.runId}`);
  const {
    data: apiAuth,
    loading: l2,
    error: e2,
    refetch: r2,
  } = useApi<AuthOverride[]>(`/api/auth-overrides?runId=${state.runId}`);
  const {
    data: apiEnv,
    loading: l3,
    error: e3,
    refetch: r3,
  } = useApi<EnvItem[]>(`/api/env-config?runId=${state.runId}`);

  const [authOverrides, setAuthOverrides] = useState<AuthOverride[]>([]);
  const [envItems, setEnvItems] = useState<EnvItem[]>([]);

  const notifyChange = useCallback(
    (message: string) => {
      dispatch({
        type: "ADD_MESSAGE",
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

  const loading = l1 || l2 || l3;
  const error = e1 || e2 || e3;

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

  if (loading) return <Phase3DataPlanSkeleton />;
  if (error || !apiEntities)
    return (
      <ErrorState
        message={error || "No data"}
        onRetry={() => {
          r1();
          r2();
          r3();
        }}
      />
    );

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
      <div className="px-4 py-3 border-b border-border text-xs font-medium flex items-center gap-2 text-muted-foreground bg-card">
        <span className="text-primary">◊</span>
        DATA & ENVIRONMENT PLAN
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Mock Data section */}
        <section>
          <div className="text-2xs font-medium mb-2 text-muted-foreground">MOCK DATA</div>
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
        </section>

        {/* Auth Overrides */}
        <section>
          <div className="text-2xs font-medium mb-2 text-muted-foreground">AUTH OVERRIDES</div>
          <div className="space-y-0 bg-card border border-border rounded-md overflow-hidden">
            {authOverrides.map((item) => (
              <div key={item.id} className="flex items-center justify-between px-3 py-2 border-b border-border">
                <span className="text-xs text-muted-foreground">{item.label}</span>
                <ToggleSwitch enabled={item.enabled} onToggle={() => toggleAuth(item.id)} />
              </div>
            ))}
          </div>
        </section>

        {/* Environment */}
        <section>
          <div className="text-2xs font-medium mb-2 text-muted-foreground">ENVIRONMENT</div>
          <div className="space-y-0 bg-card border border-border rounded-md overflow-hidden">
            {envItems.map((item) => (
              <div key={item.id} className="flex items-center justify-between px-3 py-2 border-b border-border">
                <span className="text-xs text-muted-foreground">{item.label}</span>
                <ToggleSwitch enabled={item.enabled} onToggle={() => toggleEnv(item.id)} />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function ToggleSwitch({ enabled, onToggle, disabled }: { enabled: boolean; onToggle: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onToggle}
      className="relative shrink-0 transition-colors"
      style={{
        width: "32px",
        height: "18px",
        background: disabled ? "hsl(var(--muted))" : enabled ? "hsl(var(--primary))" : "hsl(var(--muted))",
        border: `1px solid ${disabled ? "hsl(var(--border))" : enabled ? "hsl(var(--primary))" : "hsl(var(--border))"}`,
        borderRadius: "99px",
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? "default" : "pointer",
      }}
    >
      <div
        className="absolute transition-all"
        style={{
          width: "12px",
          height: "12px",
          top: "2px",
          background: disabled
            ? "hsl(var(--muted-foreground))"
            : enabled
              ? "hsl(var(--background))"
              : "hsl(var(--muted-foreground))",
          left: enabled ? "16px" : "2px",
          borderRadius: "99px",
        }}
      />
    </button>
  );
}
