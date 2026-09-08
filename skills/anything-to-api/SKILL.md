---
name: anything-to-api
description: Learn, validate, execute, or repair reusable website commands when a user invokes the `/api` URL workflow, asks to turn a website into an API, or wants to use an existing learned site operation.
license: MIT
metadata:
  author: vrlda
  version: "1.1.0"
---

# Anything-to-API

Compile user-facing website capabilities into reusable site specs. Prefer independently replayable HTTP, GraphQL, RPC, form, or WebSocket operations. Use browser interaction for discovery and repair, and only retain browser fallback when direct execution is unreliable.

Users interact through requests, not runtime commands. Run bundled `scripts/runtime.sh` internally when listing, validating, describing, or executing learned operations. Do not ask users to invoke terminal commands when agent tools can do it.

## Route the request

- `/api <url>` or “learn this site”: read [references/discovery.md](references/discovery.md), then create or update its definition.
- Execute an existing capability: inspect registry first with bundled runtime helper, then execute matching command. Do not expose helper command syntax or rediscover working operations.
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

Validate spec and replay safe commands through bundled runtime helper, not only browser UI. Read [references/runtime.md](references/runtime.md) only when helper invocation is needed. Report learned capabilities in user language, validation state, auth needed, and any browser-only fallbacks or untested consequential actions. Avoid presenting CLI instructions unless user explicitly asks for developer internals.
