import type { FastifyPluginAsync } from "fastify";
import { listAgents } from "../services/agent-executor.js";
import { getClaudeRunnerStatus } from "../services/agents/claude-code-runner.js";
import { agentRegistry, KNOWN_AGENTS } from "../services/agents/index.js";
import { getCodexRunnerStatus } from "../services/agents/openai-codex-runner.js";

export const agentsRouter: FastifyPluginAsync = async (fastify) => {
  // List available agent types (only registered/configured agents)
  fastify.get("/", async () => {
    return { data: listAgents() };
  });

  // List all known agents with their configuration status
  fastify.get("/all", async () => {
    const agentsWithStatus = await Promise.all(
      KNOWN_AGENTS.map(async (knownAgent) => {
        const isRegistered = agentRegistry.has(knownAgent.type);
        let status: {
          available: boolean;
          configured: boolean;
          message: string;
          details?: Record<string, unknown>;
        };

        // Get detailed status for each agent type
        if (knownAgent.type === "claude-code") {
          const claudeStatus = await getClaudeRunnerStatus();
          status = {
            available: claudeStatus.available,
            configured: claudeStatus.configured,
            message: claudeStatus.message,
            details: {
              cliInstalled: claudeStatus.cliInstalled,
              settingsEnabled: claudeStatus.settingsEnabled,
            },
          };
        } else if (knownAgent.type === "openai-codex") {
          const codexStatus = await getCodexRunnerStatus();
          status = {
            available: codexStatus.available,
            configured: codexStatus.configured,
            message: codexStatus.message,
            details: {
              featureFlagEnabled: codexStatus.featureFlagEnabled,
              apiKeySet: codexStatus.apiKeySet,
              cliInstalled: codexStatus.cliInstalled,
            },
          };
        } else {
          // Unknown agent type - check if registered
          status = {
            available: isRegistered,
            configured: isRegistered,
            message: isRegistered ? "Agent is available" : "Agent not configured",
          };
        }

        return {
          ...knownAgent,
          registered: isRegistered,
          status,
        };
      }),
    );

    return { data: agentsWithStatus };
  });

  // Get agent info by type
  fastify.get<{ Params: { type: string } }>("/:type", async (request, reply) => {
    const agent = agentRegistry.get(request.params.type);
    if (!agent) {
      return reply.status(404).send({ error: "Agent type not found" });
    }
    return {
      data: {
        type: agent.type,
        displayName: agent.displayName,
        capabilities: agent.capabilities,
        activeRunCount: agent.getActiveRunCount(),
      },
    };
  });

  // Get agent configuration status
  fastify.get<{ Params: { type: string } }>("/:type/status", async (request, reply) => {
    const { type } = request.params;

    // Handle OpenAI Codex status check
    if (type === "openai-codex") {
      return { data: await getCodexRunnerStatus() };
    }

    // Handle Claude Code status check
    if (type === "claude-code") {
      return { data: await getClaudeRunnerStatus() };
    }

    // Unknown agent type
    return reply.status(404).send({ error: `Unknown agent type: ${type}` });
  });
};
