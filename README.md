# Anything-to-API

Anything-to-API teaches AI agents to learn websites once and reuse them as APIs.

Tell your agent to learn a site. It explores relevant UI flows, observes network traffic, identifies reusable operations, validates them, and saves a structured local definition. Later requests use learned operations directly instead of navigating the website again.

## Install

Requires Node.js 20+, Git, and macOS or Linux. One line:

```bash
curl -fsSL https://raw.githubusercontent.com/vrlda/anything-to-api-skill/main/install.sh | bash
```

Or tell a capable coding agent:

> Install the Anything-to-API skill from https://github.com/vrlda/anything-to-api-skill

Installer registers one portable [Agent Skill](https://agentskills.io/specification) in standard shared location and compatibility locations for Claude Code, Codex, and OpenCode. Runtime and browser dependencies remain internal to skill.

## Use

Talk to agent—no Anything-to-API commands needed.

> `/api https://example.com`

> Learn how to list and download invoices from Example.

> Download all my Example invoices from 2026.

> What actions have you learned for Example?

> The saved Example integration stopped working. Repair it and retry.

Agent discovers site on first request, asks before consequential actions, and reuses saved definition afterward.

## Agent compatibility

- Any client implementing Agent Skills `SKILL.md` standard through `~/.agents/skills`
- Claude Code through `~/.claude/skills`
- OpenCode through `~/.config/opencode/skills` and shared compatibility paths
- Codex through `~/.codex/skills`

Skill contains no Codex-specific workflow. Vendor metadata is optional and ignored by other agents.

## What agent gets

- Browser/network discovery and reusable REST, GraphQL, form, multipart, WebSocket, and download operations
- Structured, validated YAML/JSON site definitions
- Browser-session, environment, callback, profile, and OS-keychain authentication
- Pagination, prerequisites, refresh flows, retries, response validation, and file output
- Safe browser fallback where direct requests cannot work
- Incremental learning and guarded self-repair
- MCP, OpenAPI, and TypeScript SDK adapters for generated applications
- Secret redaction and side-effect authorization policy

Definitions live in `~/.anything-to-api/sites`; session material stays separate in `~/.anything-to-api/sessions`. Secrets never belong in site specs.

## Maintainers and SDK authors

Architecture and internals: [architecture](docs/architecture.md), [site specification](docs/site-spec.md), [discovery](docs/discovery.md), [authentication](docs/auth-profiles.md), [security](docs/security.md), and [contributing](CONTRIBUTING.md).

MIT licensed.
