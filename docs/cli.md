# CLI

Set `ANYTHING_SITES` to colon-separated registry roots or pass `--registry`. Default registry is `~/.anything-to-api/sites`.

```text
anything sites
anything commands <site>
anything describe <site> <command>
anything validate <site.yaml>
anything call <site> <command> --arg key=value [--output file] [--yes]
anything discover <url> [--storage-state file] [--headless]
anything export-openapi <site> <output.json>
anything export-sdk <site> <output.ts>
anything mcp <site>
```

Arguments parse as JSON when possible. Thus `--arg year=2026`, `--arg active=true`, and `--arg filters='{"status":"open"}'` retain types. `--yes` is required for write, destructive, financial, and external-communication calls. MCP denies those calls unless `ANYTHING_ALLOW_SIDE_EFFECTS=1`.

File commands return bytes to stdout unless `--output` is supplied. Runtime errors include stable codes such as `SITE_NOT_FOUND`, `INVALID_ARGUMENTS`, `HTTP_ERROR`, `GRAPHQL_ERROR`, `RESPONSE_SCHEMA_MISMATCH`, `WEBSOCKET_TIMEOUT`, and `EXECUTION_DENIED`.
