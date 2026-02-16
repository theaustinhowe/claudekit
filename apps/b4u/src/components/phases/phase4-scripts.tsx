"use client";

import { useCallback, useEffect, useState } from "react";
import { ErrorState, LoadingState } from "@/components/ui/api-state";
import type { FlowScript } from "@/lib/types";
import { useApi } from "@/lib/use-api";

export function Phase4Scripts() {
  const { data: flowScripts, loading, error, refetch } = useApi<FlowScript[]>("/api/flow-scripts");
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [scripts, setScripts] = useState<FlowScript[]>([]);
  const [saving, setSaving] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  useEffect(() => {
    if (flowScripts && flowScripts.length > 0) {
      setScripts(flowScripts);
      if (activeTab === null) {
        setActiveTab(flowScripts[0].flowId);
      }
    }
  }, [flowScripts, activeTab]);

  const saveScripts = useCallback(async (updated: FlowScript[]) => {
    setSaving(true);
    try {
      const res = await fetch("/api/flow-scripts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated),
      });
      if (!res.ok) throw new Error("Failed to save scripts");
    } catch (err) {
      console.error("Failed to save scripts:", err);
    } finally {
      setSaving(false);
    }
  }, []);

  const handleDragStart = (index: number) => {
    setDragIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  const handleDrop = (targetIndex: number) => {
    if (dragIndex === null || dragIndex === targetIndex) {
      setDragIndex(null);
      setDragOverIndex(null);
      return;
    }

    const activeScript = scripts.find((f) => f.flowId === activeTab);
    if (!activeScript) return;

    const newSteps = [...activeScript.steps];
    const [moved] = newSteps.splice(dragIndex, 1);
    newSteps.splice(targetIndex, 0, moved);

    // Renumber steps
    const renumbered = newSteps.map((step, i) => ({
      ...step,
      stepNumber: i + 1,
    }));

    const updated = scripts.map((f) => (f.flowId === activeTab ? { ...f, steps: renumbered } : f));
    setScripts(updated);
    saveScripts(updated);
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    setDragOverIndex(null);
  };

  if (loading) return <LoadingState label="Loading demo scripts..." />;
  if (error || !flowScripts || flowScripts.length === 0)
    return <ErrorState message={error || "No scripts data"} onRetry={refetch} />;

  const activeScript = scripts.find((f) => f.flowId === activeTab) || scripts[0];

  return (
    <div className="h-full flex flex-col animate-slide-in-right">
      {/* Tabs */}
      <div className="flex border-b border-border overflow-x-auto shrink-0 bg-card">
        {scripts.map((script) => (
          <button
            type="button"
            key={script.flowId}
            onClick={() => setActiveTab(script.flowId)}
            className="px-3 py-2.5 text-2xs font-medium whitespace-nowrap transition-colors relative"
            style={{
              color: activeTab === script.flowId ? "hsl(var(--primary))" : "hsl(var(--muted-foreground) / 0.7)",
              background: activeTab === script.flowId ? "hsl(var(--primary) / 0.1)" : "transparent",
            }}
          >
            {script.flowName}
            {activeTab === script.flowId && <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-primary" />}
          </button>
        ))}
        {saving && <span className="text-2xs px-3 py-2.5 ml-auto text-muted-foreground">Saving...</span>}
      </div>

      {/* Steps timeline */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-[11px] top-[16px] bottom-[16px] w-[1px] bg-border" />

          <div className="space-y-0">
            {activeScript.steps.map((step, index) => (
              // biome-ignore lint/a11y/noStaticElementInteractions: drag-and-drop uses native drag events
              <div
                key={step.id}
                className="flex gap-3 relative group"
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDrop={() => handleDrop(index)}
                onDragEnd={handleDragEnd}
                style={{
                  opacity: dragIndex === index ? 0.4 : 1,
                  borderTop:
                    dragOverIndex === index && dragIndex !== null && dragIndex !== index
                      ? "2px solid hsl(var(--primary))"
                      : "2px solid transparent",
                }}
              >
                {/* Drag handle + Step node */}
                <div className="shrink-0 relative z-10 mt-1 flex items-center gap-1">
                  <div className="text-2xs cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity select-none text-muted-foreground">
                    ⋮⋮
                  </div>
                  <div
                    className="w-[22px] h-[22px] flex items-center justify-center text-2xs font-bold bg-card text-primary"
                    style={{
                      border: "1.5px solid hsl(var(--primary))",
                      borderRadius: "99px",
                    }}
                  >
                    {step.stepNumber}
                  </div>
                </div>

                {/* Step content */}
                <div className="flex-1 pb-4 mb-1 transition-colors border-b border-border">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-2xs px-1.5 py-0.5 bg-muted border border-border rounded-sm text-primary">
                      {step.url}
                    </span>
                    <span className="text-2xs text-muted-foreground">~{step.duration}</span>
                  </div>
                  <div className="text-xs mb-1 text-foreground">{step.action}</div>
                  <div className="text-2xs text-muted-foreground/70">→ {step.expectedOutcome}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="px-4 py-2 border-t border-border text-2xs flex items-center justify-between text-muted-foreground">
        <span>
          {activeScript.steps.length} steps · Est.{" "}
          {activeScript.steps.reduce((sum, s) => sum + parseInt(s.duration, 10), 0)}s total
        </span>
        <span>Drag steps to reorder</span>
      </div>
    </div>
  );
}
