# Discovery workflow

1. Normalize URL and search configured shared/project registries by ID, domain, and alias. Treat an existing definition as update unless user asks for replacement.
2. Open site with available browser tooling. Confirm login state without asking for or recording a password.
3. Inventory main navigation and user-visible capabilities. Prioritize requested workflows and a small representative set of useful actions.
4. Start network capture before each flow. Record initiator, method, URL, request headers/body, response content type/body shape, cookies, redirects, and timing. Correlate each request with one semantic action.
5. Classify transport: REST, GraphQL (including persisted query), JSON/custom RPC, form, WebSocket, or browser-bound. Ignore analytics, ads, feature flags, and unrelated background traffic.
6. Separate constants from `args`, `auth`, prerequisite `steps`, `env`, and generated `runtime` values. Identify CSRF/refresh/bootstrap flows, account IDs, cursor dependencies, signatures, upload URLs, and client-generated IDs.
7. Infer the narrowest useful typed arguments and output. Exercise pagination and error cases when safe. Trace IDs produced by one operation and consumed by another.
8. Replay candidate request independently with current session material. Compare status, content type, stable shape, and expected semantic effect. Do not claim validation from UI success alone.
9. Write/update spec, preserving unrelated working commands. Include provenance page and observation time. Mark uncertain operations `unverified`.
10. Validate schema and execute verified read commands through runtime. Produce concise learning report.

For write, destructive, financial, or external-communication flows, inspect without final submission where possible. If request capture requires the real side effect, stop immediately before execution and ask for explicit authorization naming the effect and target.

Uploads require source argument, multipart/content metadata, and any temporary URL prerequisite. Downloads require output type `file`, observed content type, and safe filename template. For WebSockets, record connection bootstrap and message correlation; use browser fallback until runtime adapter exists.
