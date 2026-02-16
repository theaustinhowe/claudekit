import type { AgentInfo, AgentRunner } from "./types.js";

/**
 * Registry for agent runners
 *
 * Allows registering and retrieving agent runners by their type identifier.
 */
class AgentRegistry {
  private runners = new Map<string, AgentRunner>();
  private defaultType: string | null = null;

  /**
   * Register an agent runner
   * @param runner The agent runner to register
   * @param isDefault Whether this should be the default runner
   * @throws Error if a runner with the same type is already registered
   */
  register(runner: AgentRunner, isDefault = false): void {
    if (this.runners.has(runner.type)) {
      throw new Error(`Agent runner '${runner.type}' is already registered`);
    }
    this.runners.set(runner.type, runner);

    // Set as default if requested or if it's the first registered runner
    if (isDefault || this.defaultType === null) {
      this.defaultType = runner.type;
    }
  }

  /**
   * Get an agent runner by type
   * @param type The type identifier of the runner
   * @returns The agent runner or undefined if not found
   */
  get(type: string): AgentRunner | undefined {
    return this.runners.get(type);
  }

  /**
   * Get the default agent runner
   * @returns The default agent runner or undefined if none registered
   */
  getDefault(): AgentRunner | undefined {
    if (this.defaultType === null) {
      return undefined;
    }
    return this.runners.get(this.defaultType);
  }

  /**
   * Set the default agent type
   * @param type The type identifier to set as default
   * @throws Error if the type is not registered
   */
  setDefault(type: string): void {
    if (!this.runners.has(type)) {
      throw new Error(`Cannot set default: agent type '${type}' is not registered`);
    }
    this.defaultType = type;
  }

  /**
   * Get all registered agent runners
   * @returns Array of all registered runners
   */
  getAll(): AgentRunner[] {
    return Array.from(this.runners.values());
  }

  /**
   * Check if a runner type is registered
   * @param type The type identifier to check
   */
  has(type: string): boolean {
    return this.runners.has(type);
  }

  /**
   * Get all registered runner types
   * @returns Array of type identifiers
   */
  getTypes(): string[] {
    return Array.from(this.runners.keys());
  }

  /**
   * Get info about all registered agents for display purposes
   * @returns Array of agent info objects
   */
  listInfo(): AgentInfo[] {
    return Array.from(this.runners.values()).map((runner) => ({
      type: runner.type,
      displayName: runner.displayName,
      capabilities: runner.capabilities,
    }));
  }

  /**
   * Get the total count of active runs across all runners
   */
  getTotalActiveRunCount(): number {
    let count = 0;
    for (const runner of this.runners.values()) {
      count += runner.getActiveRunCount();
    }
    return count;
  }
}

/**
 * Singleton agent registry instance
 */
export const agentRegistry = new AgentRegistry();
