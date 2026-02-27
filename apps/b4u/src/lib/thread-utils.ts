import { PHASE_DECISION_CONFIGS } from "./phase-decisions";
import type { Phase, PhaseDecision, PhaseThread } from "./types";
import { uid } from "./utils";

/**
 * Get the active thread for a specific phase.
 */
export function getActiveThread(
  threads: Record<Phase, PhaseThread[]>,
  activeThreadIds: Record<Phase, string | null>,
  phase: Phase,
): PhaseThread | null {
  const threadId = activeThreadIds[phase];
  if (!threadId) return null;
  return threads[phase]?.find((t) => t.id === threadId) ?? null;
}

/**
 * Get all threads for a phase, sorted by revision (ascending).
 */
export function getPhaseThreads(threads: Record<Phase, PhaseThread[]>, phase: Phase): PhaseThread[] {
  return [...(threads[phase] ?? [])].sort((a, b) => a.revision - b.revision);
}

/**
 * Check whether all required decisions for a phase have been made.
 */
export function areDecisionsComplete(thread: PhaseThread): boolean {
  const configs = PHASE_DECISION_CONFIGS[thread.phase];
  for (const config of configs) {
    if (!config.required) continue;
    const decision = thread.decisions.find((d) => d.key === config.key);
    if (!decision || decision.value === null) return false;
  }
  return true;
}

/**
 * Build empty decisions from the config for a given phase.
 */
export function buildDefaultDecisions(phase: Phase): PhaseDecision[] {
  return PHASE_DECISION_CONFIGS[phase].map((config) => ({
    id: uid(),
    key: config.key,
    label: config.label,
    type: config.type,
    options: config.options,
    value: null,
    decidedAt: null,
  }));
}

/**
 * Create a new PhaseThread for a given phase and run.
 */
export function createThread(runId: string, phase: Phase, revision: number): PhaseThread {
  return {
    id: uid(),
    runId,
    phase,
    revision,
    messages: [],
    decisions: buildDefaultDecisions(phase),
    status: "active",
    createdAt: Date.now(),
  };
}

/**
 * Get the next revision number for a phase.
 */
export function getNextRevision(threads: Record<Phase, PhaseThread[]>, phase: Phase): number {
  const existing = threads[phase] ?? [];
  if (existing.length === 0) return 1;
  return Math.max(...existing.map((t) => t.revision)) + 1;
}

/**
 * Get gate decisions that are still missing (null value) for a thread.
 * Gate decisions must be completed before the phase can be approved.
 */
export function getMissingGateDecisions(thread: PhaseThread): PhaseDecision[] {
  const configs = PHASE_DECISION_CONFIGS[thread.phase];
  const gateKeys = new Set(configs.filter((c) => c.gate).map((c) => c.key));
  return thread.decisions.filter((d) => gateKeys.has(d.key) && d.value === null);
}

/**
 * Create a revision thread that inherits gate decision values from the superseded thread.
 * Non-gate decisions are left empty (null) since they represent per-revision confirmations.
 */
export function createRevisionThread(
  runId: string,
  phase: Phase,
  revision: number,
  supersededThread?: PhaseThread,
): PhaseThread {
  const thread = createThread(runId, phase, revision);
  if (!supersededThread) return thread;

  const configs = PHASE_DECISION_CONFIGS[phase];
  const gateKeys = new Set(configs.filter((c) => c.gate).map((c) => c.key));

  thread.decisions = thread.decisions.map((d) => {
    if (!gateKeys.has(d.key)) return d;
    const prev = supersededThread.decisions.find((sd) => sd.key === d.key);
    if (prev?.value !== null && prev?.value !== undefined) {
      return { ...d, value: prev.value, decidedAt: prev.decidedAt };
    }
    return d;
  });

  return thread;
}

/**
 * Create empty thread collections for initializing state.
 */
export function emptyThreads(): Record<Phase, PhaseThread[]> {
  return { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] };
}

/**
 * Create empty activeThreadIds for initializing state.
 */
export function emptyActiveThreadIds(): Record<Phase, string | null> {
  return { 1: null, 2: null, 3: null, 4: null, 5: null, 6: null, 7: null };
}
