# Architecture

Anything-to-API separates reusable knowledge from execution and credentials.

1. Discovery skill uses available browser/network tools to correlate semantic user actions with transport requests. It writes and validates a site spec.
2. Schema package owns the stable, versioned interchange format. YAML and JSON are accepted; parsed data is canonical typed structure.
3. Runtime resolves a site by ID/domain/alias, validates arguments, enforces caller authorization policy, asks a named auth provider for session material, resolves dynamic references, and executes HTTP, GraphQL, WebSocket, multipart, or structured browser transports.
4. CLI is a thin runtime client. MCP, OpenAPI, and TypeScript SDK packages consume the same schema/runtime and remain adapters rather than core abstractions.
5. Repair package catches classified drift failures, asks an agent repair callback for an updated validated spec, writes it atomically with backup, refreshes registry, and retries safe read operations. Consequential retries require explicit opt-in.

Registry search order is caller-supplied. Default is `~/.anything-to-api/sites`; generated projects can pass bundled directories first or exclusively. Specs contain auth requirements, never secrets. Profiles and durable secure credential stores remain future provider concerns.

Browser session state is separated from specs. Non-secret profiles may map runtime values and headers to environment variables or OS keychain service/account references. Multiple account profiles can register distinct provider IDs.
