/**
 * Shared test utilities for gogo-orchestrator tests.
 *
 * Provides mock Fastify instance and reply helpers used across API route tests.
 */

export interface RouteHandler {
  method: string;
  path: string;
  handler: (request: unknown, reply: unknown) => Promise<unknown>;
}

interface MockReply {
  _statusCode: number;
  _body: unknown;
  status(code: number): MockReply;
  send(body: unknown): unknown;
}

export function createMockFastify(methods: string[] = ["GET", "POST", "PATCH", "DELETE", "PUT"]): {
  routes: RouteHandler[];
  instance: Record<string, unknown>;
} {
  const routes: RouteHandler[] = [];

  const createRouteRegistrar =
    (method: string) => (path: string, handler: (req: unknown, rep: unknown) => Promise<unknown>) => {
      routes.push({ method, path, handler });
    };

  const instance: Record<string, unknown> = {};
  for (const method of methods) {
    instance[method.toLowerCase()] = createRouteRegistrar(method);
  }

  return { routes, instance };
}

export function createMockReply(): MockReply {
  const reply: MockReply = {
    _statusCode: 200,
    _body: null,
    status(code: number) {
      reply._statusCode = code;
      return reply;
    },
    send(body: unknown) {
      reply._body = body;
      return body;
    },
  };
  return reply;
}
