# Anything-to-API

Anything-to-API is a local API compiler for websites. An agent learns meaningful site actions once, records the reusable requests in a validated site spec, and later executes them directly through a small TypeScript runtime. Browser automation remains a discovery and repair mechanism, plus a fallback for irreducibly browser-bound actions.

## Install

Requires Node.js 20+, Git, and macOS or Linux:

```bash
curl -fsSL https://raw.githubusercontent.com/vrlda/anything-to-api-skill/main/install.sh | bash
```

Installer builds runtime, installs Playwright Chromium, links `anything` into `~/.local/bin`, and registers portable skill in `~/.agents/skills` plus Codex when present. Override locations with `ANYTHING_INSTALL_DIR`, `ANYTHING_BIN_DIR`, or `ANYTHING_SKILLS_DIR`.

Then teach a site:

```bash
anything discover https://example.com
anything commands example.com
```

## MVP contents

- `packages/schema`: canonical YAML/JSON spec and Zod validator
- `packages/runtime`: registry, templating, auth providers, HTTP execution, prerequisites, pagination, retries, extraction, and files
- `packages/browser-adapter`: Playwright capture, session reuse, and structured UI fallback
- `packages/discovery`: `/api` capture and candidate inference for REST, forms, and GraphQL
- `packages/auth-adapters`: non-secret profiles and OS keychain-backed secrets
- `packages/repair`: guarded atomic repair-and-retry orchestration
- `packages/exporters`: OpenAPI and typed TypeScript SDK generation
- `packages/mcp`: MCP adapter over learned commands
- `packages/cli`: `anything` command
- `skills/anything-to-api`: portable `/api <url>` discovery skill
- `examples/demo-site`: deterministic session, pagination, CSRF, JSON, and file target
- `examples/sites/demo.local.yaml`: learned demo definition

## Quick start

```bash
pnpm install
pnpm demo
```

In another terminal:

```bash
ANYTHING_SITES=examples/sites pnpm anything sites
ANYTHING_SITES=examples/sites pnpm anything commands demo.local
```

Learn a site in a visible browser. Explore representative flows and press Enter when done:

```bash
pnpm anything discover https://example.com
pnpm anything commands example.com
pnpm anything call example.com list_invoices --arg year=2026
pnpm anything export-openapi example.com example.openapi.json
pnpm anything export-sdk example.com example-sdk.ts
pnpm anything mcp example.com
```

Discovery stores specs under `~/.anything-to-api/sites` and Playwright session state separately under `~/.anything-to-api/sessions`, both with user-only permissions. Candidate commands remain `unverified` until agent review and direct replay.

The demo spec expects auth provider `demo-session`; programmatic use shows how to supply it:

```ts
import { Anything, StaticAuthProvider } from "@anything-to-api/runtime";

const anything = new Anything({
  paths: ["./anything/sites"],
  authProviders: [new StaticAuthProvider("demo-session", {
    headers: { cookie: "demo_session=valid" },
    values: { csrf_token: "demo-csrf" },
  })],
});

const invoices = await anything.call("example.com", "list_invoices", { year: 2026 });
```

See [architecture](docs/architecture.md), [site spec](docs/site-spec.md), [discovery](docs/discovery.md), [CLI](docs/cli.md), [auth profiles](docs/auth-profiles.md), and [security](docs/security.md).
