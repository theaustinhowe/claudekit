"use client";

import { cn } from "@claudekit/ui";
import { useCallback, useEffect, useState } from "react";
import { ErrorState } from "@/components/ui/api-state";
import { Phase4ScriptsSkeleton } from "@/components/ui/phase-skeletons";
import { useApp } from "@/lib/store";
import type { FlowScript, ScriptStep } from "@/lib/types";
import { useApi } from "@/lib/use-api";
import { uid } from "@/lib/utils";
import { PhaseGoalBanner } from "./phase-goal-banner";

export function Phase4Scripts() {
  const { state } = useApp();
  const {
    data: flowScripts,
    loading,
    error,
    refetch,
  } = useApi<FlowScript[]>(`/api/flow-scripts?runId=${state.runId}`, state.panelRefreshKey);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [scripts, setScripts] = useState<FlowScript[]>([]);
  const [saving, setSaving] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [editingStep, setEditingStep] = useState<string | null>(null);

  useEffect(() => {
    if (flowScripts && flowScripts.length > 0) {
      setScripts(flowScripts);
      if (activeTab === null) {
        setActiveTab(flowScripts[0].flowId);
      }
    }
  }, [flowScripts, activeTab]);

  const saveScripts = useCallback(
    async (updated: FlowScript[]) => {
      setSaving(true);
      try {
        const res = await fetch(`/api/flow-scripts?runId=${state.runId}`, {
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
    },
    [state.runId],
  );

  const updateStep = useCallback(
    (stepId: string, field: keyof ScriptStep, value: string) => {
      const updated = scripts.map((f) =>
        f.flowId === activeTab
          ? { ...f, steps: f.steps.map((s) => (s.id === stepId ? { ...s, [field]: value } : s)) }
          : f,
      );
      setScripts(updated);
      saveScripts(updated);
    },
    [scripts, activeTab, saveScripts],
  );

  const addStep = useCallback(() => {
    const activeScript = scripts.find((f) => f.flowId === activeTab);
    if (!activeScript) return;

    const newStep: ScriptStep = {
      id: uid(),
      stepNumber: activeScript.steps.length + 1,
      url: "/",
      action: "New action",
      expectedOutcome: "Expected result",
      duration: "2s",
    };

    const updated = scripts.map((f) => (f.flowId === activeTab ? { ...f, steps: [...f.steps, newStep] } : f));
    setScripts(updated);
    setEditingStep(newStep.id);
    saveScripts(updated);
  }, [scripts, activeTab, saveScripts]);

  const removeStep = useCallback(
    (stepId: string) => {
      const updated = scripts.map((f) => {
        if (f.flowId !== activeTab) return f;
        const filtered = f.steps.filter((s) => s.id !== stepId);
        return { ...f, steps: filtered.map((s, i) => ({ ...s, stepNumber: i + 1 })) };
      });
      setScripts(updated);
      setEditingStep(null);
      saveScripts(updated);
    },
    [scripts, activeTab, saveScripts],
  );

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

  // Keyboard reorder support
  const handleKeyboardReorder = useCallback(
    (index: number, e: React.KeyboardEvent) => {
      const activeScript = scripts.find((f) => f.flowId === activeTab);
      if (!activeScript) return;

      let newIndex: number | null = null;
      if (e.altKey && e.key === "ArrowUp" && index > 0) {
        newIndex = index - 1;
      } else if (e.altKey && e.key === "ArrowDown" && index < activeScript.steps.length - 1) {
        newIndex = index + 1;
      }

      if (newIndex === null) return;
      e.preventDefault();

      const newSteps = [...activeScript.steps];
      const [moved] = newSteps.splice(index, 1);
      newSteps.splice(newIndex, 0, moved);
      const renumbered = newSteps.map((step, i) => ({ ...step, stepNumber: i + 1 }));

      const updated = scripts.map((f) => (f.flowId === activeTab ? { ...f, steps: renumbered } : f));
      setScripts(updated);
      saveScripts(updated);
    },
    [scripts, activeTab, saveScripts],
  );

  if (loading) return <Phase4ScriptsSkeleton />;
  if (error || !flowScripts || flowScripts.length === 0 || !flowScripts.some((f) => f.steps?.length))
    return <ErrorState message={error || "No scripts data"} onRetry={refetch} />;

  const activeScript = scripts.find((f) => f.flowId === activeTab) || scripts[0];

  // scripts state syncs from flowScripts via useEffect (runs after render),
  // so there's a one-render gap where scripts is [] but the guard above passed
  if (!activeScript?.steps?.length) return <Phase4ScriptsSkeleton />;

  return (
    <div className="h-full flex flex-col animate-slide-in-right">
      <PhaseGoalBanner phase={4} />
      {/* Tabs */}
      <div className="flex border-b border-border overflow-x-auto shrink-0 bg-card">
        {scripts.map((script) => (
          <button
            type="button"
            key={script.flowId}
            onClick={() => setActiveTab(script.flowId)}
            className={cn(
              "px-3 py-2.5 text-2xs font-medium whitespace-nowrap transition-colors relative",
              activeTab === script.flowId ? "text-primary bg-primary/10" : "text-muted-foreground/70",
            )}
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
          <div className="absolute left-3 top-4 bottom-4 w-[1px] bg-border" />

          <div role="listbox" aria-roledescription="sortable" aria-label="Demo script steps" className="space-y-0">
            {activeScript.steps.map((step, index) => (
              <div
                key={step.id}
                role="option"
                aria-selected={editingStep === step.id}
                aria-grabbed={dragIndex === index}
                aria-label={`Step ${step.stepNumber}: ${step.action}`}
                tabIndex={0}
                className="flex gap-3 relative group"
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDrop={() => handleDrop(index)}
                onDragEnd={handleDragEnd}
                onKeyDown={(e) => handleKeyboardReorder(index, e)}
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
                  <div className="w-[22px] h-[22px] flex items-center justify-center text-2xs font-bold bg-card text-primary border-[1.5px] border-primary rounded-full">
                    {step.stepNumber}
                  </div>
                </div>

                {/* Step content */}
                <div className="flex-1 pb-4 mb-1 transition-colors border-b border-border">
                  {editingStep === step.id ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-[1fr_60px] gap-2">
                        <StepField label="URL" value={step.url} onChange={(v) => updateStep(step.id, "url", v)} />
                        <StepField
                          label="Duration"
                          value={step.duration}
                          onChange={(v) => updateStep(step.id, "duration", v)}
                        />
                      </div>
                      <StepField
                        label="Action"
                        value={step.action}
                        onChange={(v) => updateStep(step.id, "action", v)}
                      />
                      <StepField
                        label="Expected outcome"
                        value={step.expectedOutcome}
                        onChange={(v) => updateStep(step.id, "expectedOutcome", v)}
                      />
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingStep(null)}
                          className="text-2xs px-2 py-1 text-primary bg-primary/10 border border-primary rounded-sm"
                        >
                          Done
                        </button>
                        <button
                          type="button"
                          onClick={() => removeStep(step.id)}
                          className="text-2xs px-2 py-1 text-destructive border border-destructive rounded-sm bg-transparent hover:bg-destructive/10"
                        >
                          Remove step
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="w-full text-left bg-transparent border-none p-0 cursor-pointer"
                      onClick={() => setEditingStep(step.id)}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-2xs px-1.5 py-0.5 bg-muted border border-border rounded-sm text-primary">
                          {step.url}
                        </span>
                        <span className="text-2xs text-muted-foreground">~{step.duration}</span>
                      </div>
                      <div className="text-xs mb-1 text-foreground">{step.action}</div>
                      <div className="text-2xs text-muted-foreground/70">→ {step.expectedOutcome}</div>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Add step button */}
          <button
            type="button"
            onClick={addStep}
            className="flex items-center gap-1 mt-2 ml-8 text-2xs transition-colors text-muted-foreground hover:text-primary"
          >
            + Add step
          </button>
        </div>
      </div>

      <div className="px-4 py-2 border-t border-border text-2xs flex items-center justify-between text-muted-foreground">
        <span>
          {activeScript.steps.length} steps · Est.{" "}
          {activeScript.steps.reduce((sum, s) => sum + parseInt(s.duration, 10), 0)}s total
        </span>
        <span>Click to edit · Drag to reorder · Alt+↑↓ to move · Tab to focus</span>
      </div>
    </div>
  );
}

function StepField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  return (
    <label className="text-2xs block text-muted-foreground">
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
        className="w-full text-xs px-2 py-1 outline-none bg-input border border-input rounded-sm text-foreground"
      />
    </label>
  );
}
