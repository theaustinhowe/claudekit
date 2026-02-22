import type { JobLog, WsMessage } from "@claudekit/gogo-shared";
import type { WebSocket } from "@fastify/websocket";
import { z } from "zod";
import { WsClientMessageSchema } from "../schemas/index.js";
import { getRingBuffer } from "../utils/job-logging.js";

interface ClientConnection {
  socket: WebSocket;
  subscriptions: Set<string>; // jobIds
  repoSubscriptions: Set<string>; // repositoryIds (multi-repo support)
}

const clients = new Map<WebSocket, ClientConnection>();

export function setupWebSocket(socket: WebSocket) {
  const client: ClientConnection = {
    socket,
    subscriptions: new Set(),
    repoSubscriptions: new Set(),
  };
  clients.set(socket, client);

  // Send connection established message
  sendToClient(socket, { type: "connection:established", payload: {} });

  socket.on("message", (data: Buffer | ArrayBuffer | Buffer[]) => {
    try {
      // SECURITY: Enforce message size limit to prevent memory exhaustion attacks.
      // WebSocket messages should be small control messages (subscribe/unsubscribe/ping).
      const MAX_WS_MESSAGE_SIZE = 16 * 1024; // 16KB
      const messageBytes = Buffer.isBuffer(data) ? data.length : Buffer.byteLength(data.toString());
      if (messageBytes > MAX_WS_MESSAGE_SIZE) {
        sendToClient(socket, {
          type: "error",
          payload: { message: "Message too large" },
        });
        return;
      }

      const raw = JSON.parse(data.toString());
      const parsed = WsClientMessageSchema.safeParse(raw);

      if (!parsed.success) {
        sendToClient(socket, {
          type: "error",
          payload: {
            message: "Invalid message format",
            details: z.treeifyError(parsed.error),
          },
        });
        return;
      }

      const msg = parsed.data;

      switch (msg.type) {
        case "subscribe": {
          const jobId = msg.payload.jobId;
          const lastSequence = msg.payload.lastSequence;
          client.subscriptions.add(jobId);
          sendToClient(socket, { type: "subscribed", payload: { jobId } });

          // Replay ring buffer for late subscribers / reconnections
          const replayEntries = getRingBuffer(jobId, lastSequence);
          for (const entry of replayEntries) {
            sendToClient(socket, {
              type: "job:log",
              payload: {
                jobId,
                stream: entry.stream,
                content: entry.content,
                sequence: entry.sequence,
              },
            });
          }
          break;
        }

        case "unsubscribe": {
          const jobId = msg.payload.jobId;
          client.subscriptions.delete(jobId);
          sendToClient(socket, { type: "unsubscribed", payload: { jobId } });
          break;
        }

        case "ping": {
          sendToClient(socket, { type: "pong", payload: {} });
          break;
        }

        case "subscribe_repo": {
          const repositoryId = msg.payload.repositoryId;
          client.repoSubscriptions.add(repositoryId);
          sendToClient(socket, {
            type: "subscribed_repo",
            payload: { repositoryId },
          });
          break;
        }

        case "unsubscribe_repo": {
          const repositoryId = msg.payload.repositoryId;
          client.repoSubscriptions.delete(repositoryId);
          sendToClient(socket, {
            type: "unsubscribed_repo",
            payload: { repositoryId },
          });
          break;
        }
      }
    } catch {
      sendToClient(socket, {
        type: "error",
        payload: { message: "Failed to parse message" },
      });
    }
  });

  socket.on("close", () => {
    clients.delete(socket);
  });
}

function sendToClient(socket: WebSocket, message: WsMessage) {
  if (socket.readyState === 1) {
    // OPEN
    socket.send(JSON.stringify(message));
  }
}

/**
 * Broadcast a message to all connected clients
 */
export function broadcast(message: WsMessage) {
  const data = JSON.stringify(message);
  for (const client of clients.values()) {
    if (client.socket.readyState === 1) {
      // OPEN
      client.socket.send(data);
    }
  }
}

/**
 * Broadcast a message only to clients subscribed to a specific job
 */
export function broadcastToJob(jobId: string, message: WsMessage) {
  const data = JSON.stringify(message);
  for (const client of clients.values()) {
    if (client.socket.readyState === 1 && client.subscriptions.has(jobId)) {
      client.socket.send(data);
    }
  }
}

/**
 * Send a log entry to all clients subscribed to the job
 */
export function sendLogToSubscribers(jobId: string, log: Pick<JobLog, "stream" | "content" | "sequence">) {
  broadcastToJob(jobId, {
    type: "job:log",
    payload: { jobId, ...log },
  });
}

/**
 * Get the number of connected clients
 */
export function getClientCount(): number {
  return clients.size;
}
