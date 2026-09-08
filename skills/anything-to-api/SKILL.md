---
name: anything-to-api
description: Learn, validate, execute, or repair reusable website commands when a user invokes the `/api` URL workflow, asks to turn a website into an API, or wants to use an existing learned site operation.
---

# Anything-to-API

Compile user-facing website capabilities into reusable site specs. Prefer independently replayable HTTP, GraphQL, RPC, form, or WebSocket operations. Use browser interaction for discovery and repair, and only retain browser fallback when direct execution is unreliable.

## Route the request

- `/api <url>` or “learn this site”: read [references/discovery.md](references/discovery.md), then create or update its definition.
- Execute an existing capability: inspect registry first, list/describe matching commands, then call through runtime. Do not rediscover working operations.
- Broken learned command: read [references/repair.md](references/repair.md) and repair only affected paths.
- Authoring or reviewing a definition: read [references/spec-authoring.md](references/spec-authoring.md).

Default registry: `~/.anything-to-api/sites/<site-id>/site.yaml`. Project-bundled registries may live under `anything/sites`. Resolve domain and aliases before creating a duplicate.

## Invariants

- Site spec is source of truth; prose is supporting context only.
- Never persist passwords, tokens, cookies, private keys, or captured personal data in specs.
- Model dynamic values with references to arguments, auth providers, steps, environment, or generated runtime state. Never replay captured ephemeral values as constants.
- Give commands stable semantic names and typed contracts. Record validation and provenance useful for later repair.
- Classify every command as `read`, `write`, `destructive`, `financial`, or `external_communication`.
- Read-only discovery may proceed. Obtain explicit user authorization immediately before executing any operation with consequential external effects. Observation alone does not authorize mutation.
- Stay within user-selected site/account scope. Avoid exhaustive crawling when representative functionality proves the requested loop.

## Finish

Validate the spec with `anything validate <path>`. Replay safe commands through runtime, not only browser UI. Report learned commands, validation state, auth provider needed, registry path, and any browser-only fallbacks or untested consequential actions.
