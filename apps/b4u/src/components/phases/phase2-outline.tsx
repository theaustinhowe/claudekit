"use client";

import { useCallback, useEffect, useState } from "react";
import { ErrorState, LoadingState } from "@/components/ui/api-state";
import type { RouteEntry, UserFlow } from "@/lib/types";
import { useApi } from "@/lib/use-api";
import { uid } from "@/lib/utils";

function validateRoute(route: RouteEntry): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!route.path.trim()) errors.path = "Path is required";
  else if (!route.path.startsWith("/")) errors.path = "Path must start with /";
  else if (route.path.length > 200) errors.path = "Path too long";
  if (!route.title.trim()) errors.title = "Title is required";
  else if (route.title.length > 100) errors.title = "Title too long";
  if (route.description.length > 500) errors.description = "Description too long";
  return errors;
}

export function Phase2Outline() {
  const {
    data: apiRoutes,
    loading: loadingRoutes,
    error: errorRoutes,
    refetch: refetchRoutes,
  } = useApi<RouteEntry[]>("/api/routes");
  const {
    data: apiFlows,
    loading: loadingFlows,
    error: errorFlows,
    refetch: refetchFlows,
  } = useApi<UserFlow[]>("/api/user-flows");

  const [routes, setRoutes] = useState<RouteEntry[]>([]);
  const [flows, setFlows] = useState<UserFlow[]>([]);
  const [editingRoute, setEditingRoute] = useState<number | null>(null);
  const [editingFlow, setEditingFlow] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"routes" | "flows">("routes");
  const [saving, setSaving] = useState(false);
  const [routeErrors, setRouteErrors] = useState<Record<number, Record<string, string>>>({});
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (apiRoutes) setRoutes(apiRoutes);
  }, [apiRoutes]);

  useEffect(() => {
    if (apiFlows) setFlows(apiFlows);
  }, [apiFlows]);

  const loading = loadingRoutes || loadingFlows;
  const error = errorRoutes || errorFlows;

  const saveRoutes = useCallback(async (updated: RouteEntry[]) => {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/routes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to save routes");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save routes";
      setSaveError(msg);
      console.error("Failed to save routes:", err);
    } finally {
      setSaving(false);
    }
  }, []);

  const saveFlows = useCallback(async (updated: UserFlow[]) => {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/user-flows", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to save flows");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save flows";
      setSaveError(msg);
      console.error("Failed to save flows:", err);
    } finally {
      setSaving(false);
    }
  }, []);

  const updateRoute = (index: number, field: keyof RouteEntry, value: string | boolean) => {
    const updatedRoute = { ...routes[index], [field]: value };
    const errors = validateRoute(updatedRoute);
    setRouteErrors((prev) => {
      const next = { ...prev };
      if (Object.keys(errors).length > 0) {
        next[index] = errors;
      } else {
        delete next[index];
      }
      return next;
    });
    const updated = routes.map((r, i) => (i === index ? updatedRoute : r));
    setRoutes(updated);
    if (Object.keys(errors).length === 0) {
      setSaveError(null);
      saveRoutes(updated);
    }
  };

  const addRoute = () => {
    const updated = [
      ...routes,
      { path: "/new-route", title: "New Page", authRequired: false, description: "Description" },
    ];
    setRoutes(updated);
    setEditingRoute(updated.length - 1);
    saveRoutes(updated);
  };

  const removeRoute = (index: number) => {
    const updated = routes.filter((_, i) => i !== index);
    setRoutes(updated);
    setEditingRoute(null);
    saveRoutes(updated);
  };

  const addFlow = () => {
    const newFlow: UserFlow = {
      id: uid(),
      name: "New Flow",
      steps: ["Step 1"],
    };
    const updated = [...flows, newFlow];
    setFlows(updated);
    setEditingFlow(newFlow.id);
    saveFlows(updated);
  };

  const removeFlow = (flowId: string) => {
    const updated = flows.filter((f) => f.id !== flowId);
    setFlows(updated);
    setEditingFlow(null);
    saveFlows(updated);
  };

  const updateFlowName = (flowId: string, name: string) => {
    const updated = flows.map((f) => (f.id === flowId ? { ...f, name } : f));
    setFlows(updated);
    saveFlows(updated);
  };

  const updateFlowStep = (flowId: string, stepIndex: number, value: string) => {
    const updated = flows.map((f) => {
      if (f.id !== flowId) return f;
      return { ...f, steps: f.steps.map((s, i) => (i === stepIndex ? value : s)) };
    });
    setFlows(updated);
    saveFlows(updated);
  };

  const addFlowStep = (flowId: string) => {
    const updated = flows.map((f) => {
      if (f.id !== flowId) return f;
      return { ...f, steps: [...f.steps, `Step ${f.steps.length + 1}`] };
    });
    setFlows(updated);
    saveFlows(updated);
  };

  const removeFlowStep = (flowId: string, stepIndex: number) => {
    const updated = flows.map((f) => {
      if (f.id !== flowId) return f;
      const steps = f.steps.filter((_, i) => i !== stepIndex);
      return { ...f, steps: steps.length > 0 ? steps : ["Step 1"] };
    });
    setFlows(updated);
    saveFlows(updated);
  };

  if (loading) return <LoadingState label="Loading app outline..." />;
  if (error)
    return (
      <ErrorState
        message={error}
        onRetry={() => {
          refetchRoutes();
          refetchFlows();
        }}
      />
    );

  return (
    <div className="h-full flex flex-col animate-slide-in-right">
      <div className="px-4 py-3 border-b border-border flex items-center gap-4 bg-card">
        <button
          type="button"
          onClick={() => setActiveTab("routes")}
          className="text-xs font-medium px-2.5 py-1 transition-colors rounded-sm"
          style={{
            color: activeTab === "routes" ? "hsl(var(--primary))" : "hsl(var(--muted-foreground) / 0.7)",
            background: activeTab === "routes" ? "hsl(var(--primary) / 0.1)" : "transparent",
            border: activeTab === "routes" ? "1px solid hsl(var(--primary))" : "1px solid transparent",
          }}
        >
          Routes ({routes.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("flows")}
          className="text-xs font-medium px-2.5 py-1 transition-colors rounded-sm"
          style={{
            color: activeTab === "flows" ? "hsl(var(--primary))" : "hsl(var(--muted-foreground) / 0.7)",
            background: activeTab === "flows" ? "hsl(var(--primary) / 0.1)" : "transparent",
            border: activeTab === "flows" ? "1px solid hsl(var(--primary))" : "1px solid transparent",
          }}
        >
          User Flows ({flows.length})
        </button>
        <span
          className="text-2xs ml-auto"
          style={{ color: saveError ? "hsl(var(--destructive))" : "hsl(var(--muted-foreground))" }}
        >
          {saveError ? saveError : saving ? "Saving..." : ""}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeTab === "routes" ? (
          <div className="p-2">
            {/* Header row */}
            <div className="grid grid-cols-[1fr_1fr_60px_2fr] gap-2 px-3 py-2 text-2xs font-medium text-muted-foreground">
              <div>PATH</div>
              <div>TITLE</div>
              <div>AUTH</div>
              <div>DESCRIPTION</div>
            </div>
            {routes.map((route, i) => (
              <div key={`${route.path}-${i}`}>
                <button
                  type="button"
                  className="grid grid-cols-[1fr_1fr_60px_2fr] gap-2 px-3 py-2 text-xs transition-colors cursor-pointer w-full text-left text-muted-foreground"
                  style={{
                    background: editingRoute === i ? "hsl(var(--card))" : "transparent",
                    border: "none",
                  }}
                  onClick={() => setEditingRoute(editingRoute === i ? null : i)}
                  onMouseEnter={(e) => {
                    if (editingRoute !== i) e.currentTarget.style.background = "hsl(var(--card))";
                  }}
                  onMouseLeave={(e) => {
                    if (editingRoute !== i) e.currentTarget.style.background = "transparent";
                  }}
                >
                  <div className="truncate text-primary">{route.path}</div>
                  <div className="truncate">{route.title}</div>
                  <div>
                    <span
                      className="text-2xs px-1.5 py-0.5 rounded-sm"
                      style={{
                        background: route.authRequired ? "rgba(251, 191, 36, 0.1)" : "rgba(52, 211, 153, 0.1)",
                        color: route.authRequired ? "hsl(var(--warning))" : "hsl(var(--success))",
                        border: `1px solid ${route.authRequired ? "rgba(251, 191, 36, 0.2)" : "rgba(52, 211, 153, 0.2)"}`,
                      }}
                    >
                      {route.authRequired ? "yes" : "no"}
                    </span>
                  </div>
                  <div className="truncate text-muted-foreground/70">{route.description}</div>
                </button>

                {/* Inline edit form */}
                {editingRoute === i && (
                  <div className="px-3 py-3 space-y-2 bg-card border-b border-border">
                    <div className="grid grid-cols-2 gap-2">
                      <EditField
                        label="Path"
                        value={route.path}
                        onChange={(v) => updateRoute(i, "path", v)}
                        error={routeErrors[i]?.path}
                      />
                      <EditField
                        label="Title"
                        value={route.title}
                        onChange={(v) => updateRoute(i, "title", v)}
                        error={routeErrors[i]?.title}
                      />
                    </div>
                    <EditField
                      label="Description"
                      value={route.description}
                      onChange={(v) => updateRoute(i, "description", v)}
                      error={routeErrors[i]?.description}
                    />
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 text-2xs text-muted-foreground">
                        <input
                          type="checkbox"
                          checked={route.authRequired}
                          onChange={(e) => updateRoute(i, "authRequired", e.target.checked)}
                          className="accent-primary"
                        />
                        Auth Required
                      </label>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeRoute(i);
                        }}
                        className="text-2xs px-2 py-1 transition-colors text-destructive border border-destructive rounded-sm bg-transparent"
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "rgba(239, 68, 68, 0.1)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "transparent";
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={addRoute}
              className="flex items-center gap-1 px-3 py-2 mt-1 text-2xs transition-colors text-muted-foreground"
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "hsl(var(--primary))";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "hsl(var(--muted-foreground))";
              }}
            >
              + Add route
            </button>
          </div>
        ) : (
          <div className="p-3 space-y-3">
            {flows.map((flow) => (
              <div key={flow.id} className="p-3.5 bg-card border border-border rounded-md">
                {editingFlow === flow.id ? (
                  <div className="space-y-2">
                    <EditField label="Flow name" value={flow.name} onChange={(v) => updateFlowName(flow.id, v)} />
                    <div className="text-2xs text-muted-foreground mb-1">Steps</div>
                    {flow.steps.map((step, si) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: flow steps are plain strings with no stable key
                      <div key={si} className="flex items-center gap-1.5">
                        <span className="text-2xs text-muted-foreground w-[16px] shrink-0">{si + 1}.</span>
                        <FlowStepField value={step} onChange={(v) => updateFlowStep(flow.id, si, v)} />
                        {flow.steps.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeFlowStep(flow.id, si)}
                            className="text-2xs text-destructive shrink-0 px-1"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                    <div className="flex items-center gap-2 mt-2">
                      <button
                        type="button"
                        onClick={() => addFlowStep(flow.id)}
                        className="text-2xs text-muted-foreground transition-colors"
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = "hsl(var(--primary))";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = "hsl(var(--muted-foreground))";
                        }}
                      >
                        + Add step
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingFlow(null)}
                        className="text-2xs px-2 py-1 text-primary bg-primary/10 border border-primary rounded-sm"
                      >
                        Done
                      </button>
                      <button
                        type="button"
                        onClick={() => removeFlow(flow.id)}
                        className="text-2xs px-2 py-1 text-destructive border border-destructive rounded-sm bg-transparent"
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "rgba(239, 68, 68, 0.1)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "transparent";
                        }}
                      >
                        Remove flow
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="w-full text-left bg-transparent border-none p-0 cursor-pointer"
                    onClick={() => setEditingFlow(flow.id)}
                  >
                    <div className="text-xs font-medium mb-2 text-foreground">{flow.name}</div>
                    <div className="flex items-center gap-1 flex-wrap">
                      {flow.steps.map((step, si) => (
                        // biome-ignore lint/suspicious/noArrayIndexKey: flow steps are plain strings with no stable key
                        <div key={si} className="flex items-center gap-1">
                          <span className="text-2xs px-1.5 py-0.5 bg-muted border border-border rounded-sm text-primary">
                            {step}
                          </span>
                          {si < flow.steps.length - 1 && <span className="text-2xs text-muted-foreground">→</span>}
                        </div>
                      ))}
                    </div>
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={addFlow}
              className="flex items-center gap-1 px-3 py-2 text-2xs transition-colors text-muted-foreground"
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "hsl(var(--primary))";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "hsl(var(--muted-foreground))";
              }}
            >
              + Add flow
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function EditField({
  label,
  value,
  onChange,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  return (
    <div>
      <label
        className="text-2xs block mb-0.5"
        style={{ color: error ? "hsl(var(--destructive))" : "hsl(var(--muted-foreground))" }}
      >
        {label}
        <input
          type="text"
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          onBlur={() => {
            if (localValue !== value) onChange(localValue);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              if (localValue !== value) onChange(localValue);
              (e.target as HTMLInputElement).blur();
            }
          }}
          className="w-full text-xs px-2 py-1 outline-none bg-input rounded-sm text-foreground"
          style={{
            border: error ? "1px solid hsl(var(--destructive))" : "1px solid hsl(var(--input))",
          }}
        />
      </label>
      {error && <div className="text-2xs mt-0.5 text-destructive">{error}</div>}
    </div>
  );
}

function FlowStepField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  return (
    <input
      type="text"
      value={localValue}
      onChange={(e) => setLocalValue(e.target.value)}
      onBlur={() => {
        if (localValue !== value) onChange(localValue);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          if (localValue !== value) onChange(localValue);
          (e.target as HTMLInputElement).blur();
        }
      }}
      className="flex-1 text-xs px-2 py-1 outline-none bg-input border border-input rounded-sm text-foreground"
    />
  );
}
