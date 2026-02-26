export type Phase = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const PHASE_LABELS: Record<Phase, string> = {
  1: "Project Selection",
  2: "App Outline",
  3: "Data & Env Plan",
  4: "Demo Scripts",
  5: "Recording",
  6: "Voiceover",
  7: "Final Output",
};

export type PhaseStatus = "locked" | "active" | "completed";

export interface ChatMessage {
  id: string;
  role: "ai" | "user" | "system";
  content: string;
  timestamp: number;
  actionCard?: ActionCard;
}

export type ActionCard =
  | { type: "folder-select" }
  | { type: "project-summary"; data: ProjectSummary }
  | { type: "approve"; phase: Phase; label?: string }
  | { type: "scanning"; label: string }
  | { type: "session-progress"; sessionId: string; label: string }
  | { type: "recording-complete" }
  | { type: "processing" }
  | { type: "final-ready" }
  | { type: "edit-request"; phase: Phase; request: string };

export interface ProjectSummary {
  name: string;
  framework: string;
  directories: string[];
  auth: string;
  database: string;
}

export interface FileTreeNode {
  name: string;
  type: "file" | "directory";
  children?: FileTreeNode[];
}

export interface RouteEntry {
  path: string;
  title: string;
  authRequired: boolean;
  description: string;
}

export interface UserFlow {
  id: string;
  name: string;
  steps: string[];
}

export interface MockDataEntity {
  name: string;
  count: number;
  note: string;
}

export interface AuthOverride {
  id: string;
  label: string;
  enabled: boolean;
}

export interface EnvItem {
  id: string;
  label: string;
  enabled: boolean;
}

export interface ScriptStep {
  id: string;
  stepNumber: number;
  url: string;
  action: string;
  expectedOutcome: string;
  duration: string;
}

export interface FlowScript {
  flowId: string;
  flowName: string;
  steps: ScriptStep[];
}

export interface RecordingStatus {
  flowId: string;
  flowName: string;
  status: "queued" | "seeding" | "launching" | "recording" | "processing" | "done";
  progress: number;
}

export interface VoiceOption {
  id: string;
  name: string;
  style: string;
}

export interface TimelineMarker {
  timestamp: string;
  label: string;
  paragraphIndex: number;
}

export interface ChapterMarker {
  flowName: string;
  startTime: string;
}

// ---------------------------------------------------------------------------
// Per-Phase Threading
// ---------------------------------------------------------------------------

export type ThreadStatus = "active" | "completed" | "superseded";

export interface PhaseThread {
  id: string;
  runId: string;
  phase: Phase;
  revision: number;
  messages: ChatMessage[];
  decisions: PhaseDecision[];
  status: ThreadStatus;
  createdAt: number;
}

export interface PhaseDecision {
  id: string;
  key: string;
  label: string;
  type: "select" | "confirm" | "text";
  options?: DecisionOption[];
  value: string | null;
  decidedAt: number | null;
}

export interface DecisionOption {
  label: string;
  value: string;
}

export interface PhaseDecisionConfig {
  key: string;
  label: string;
  type: "select" | "confirm" | "text";
  required: boolean;
  options?: DecisionOption[];
}
