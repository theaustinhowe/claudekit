Written `API_REFERENCE.md` at the project root. The file documents:

- **~150 REST endpoints** across 6 apps (web, gadget, inside, gogo-orchestrator, b4u, inspector)
- **~170 Server Action functions** across 7 apps (including ducktails and gogo-web)
- **WebSocket protocol** for gogo-orchestrator real-time streaming
- **Authentication** — Bearer token auth on gogo-orchestrator, all other apps local-only
- **Error handling** — standard error response shapes, status codes, Zod validation patterns
- **Common patterns** — shared session system, filesystem browsing, Claude usage actions
- **Request/response schemas** — body shapes, query parameters, path params, and response formats for every endpoint
- **Shared types** — `ApiResponse<T>`, `PaginatedResponse<T>`, job status state machine, session types, WebSocket protocol types
