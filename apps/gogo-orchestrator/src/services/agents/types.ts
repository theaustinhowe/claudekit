import type { InjectMode, LogStream } from "@claudekit/gogo-shared";

/**
 * Capabilities that an agent runner supports
 */
export interface AgentCapabilities {
  /** Whether the agent can resume from a saved session */
  canResume: boolean;
  /** Whether messages can be injected into the agent */
  canInject: boolean;
  /** Whether the agent supports streaming output */
  supportsStreaming: boolean;
}

/**
 * Context for a job that an agent is running
 */
export interface AgentJobContext {
  jobId: string;
  issueNumber: number;
  issueTitle: string;
  issueBody: string | null;
  worktreePath: string;
  branch: string;
  repositoryOwner: string;
  repositoryName: string;
}

/**
 * Configuration for running an agent
 * All properties are optional to allow flexible agent-specific configuration
 */
export interface AgentConfig {
  /** Maximum runtime in milliseconds */
  maxRuntimeMs?: number;
  /** Test command to run */
  testCommand?: string;
  /** Additional agent-specific settings */
  [key: string]: unknown;
}

/**
 * Session data for resuming an agent
 */
export interface AgentSession {
  sessionId: string;
  agentType: string;
  savedAt?: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Signal types emitted by agents
 */
export type AgentSignal =
  | { type: "ready_to_pr" }
  | { type: "needs_info"; question: string }
  | { type: "error"; message: string }
  | { type: "completed"; summary?: string };

/**
 * Callbacks for agent events
 */
export interface AgentCallbacks {
  /** Called when the agent emits a log line */
  onLog: (stream: LogStream, content: string) => Promise<void>;
  /** Called when the agent signals a state change */
  onSignal: (signal: AgentSignal) => Promise<void>;
  /** Called when a new session is created */
  onSessionCreated: (sessionId: string) => Promise<void>;
  /** Called when the agent's work phase changes */
  onPhaseChange: (phase: string, progress?: number) => Promise<void>;
}

/**
 * Result of starting or resuming an agent
 */
export interface AgentStartResult {
  success: boolean;
  error?: string;
}

/**
 * Info about an agent for display purposes
 */
export interface AgentInfo {
  type: string;
  displayName: string;
  capabilities: AgentCapabilities;
}

/**
 * Interface that all agent runners must implement
 */
export interface AgentRunner {
  /** Unique type identifier for this runner */
  type: string;
  /** Human-readable display name */
  displayName: string;
  /** Capabilities this runner supports */
  capabilities: AgentCapabilities;

  /**
   * Start a new agent run
   */
  start(context: AgentJobContext, config: AgentConfig, callbacks: AgentCallbacks): Promise<AgentStartResult>;

  /**
   * Resume a paused agent run (optional - check capabilities.canResume)
   */
  resume?(
    context: AgentJobContext,
    session: AgentSession,
    config: AgentConfig,
    callbacks: AgentCallbacks,
    message?: string,
  ): Promise<AgentStartResult>;

  /**
   * Inject a message into a running agent (optional - check capabilities.canInject)
   */
  inject?(jobId: string, message: string, mode: InjectMode): Promise<AgentStartResult>;

  /**
   * Stop a running agent
   * @param jobId The job ID
   * @param saveSession Whether to save the session for later resume
   * @returns true if the agent was stopped, false if not running
   */
  stop(jobId: string, saveSession?: boolean): Promise<boolean>;

  /**
   * Check if an agent is currently running for a job
   */
  isRunning(jobId: string): boolean;

  /**
   * Get the count of active runs for this agent type
   */
  getActiveRunCount(): number;
}
