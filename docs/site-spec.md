# Site specification 1.0

Site specs are YAML or JSON validated by `siteSpecSchema`. Required top-level fields are `specVersion`, `site`, `baseUrls`, `auth`, `commands`, and `discovery`.

Each command has a semantic snake-case name, description, side-effect class, typed arguments, transport request, output type, and validation state. Optional fields cover prerequisites, extraction, cursor pagination, retry, UI fallback, and provenance.

## References

Double-brace references can appear in strings and structured request values:

- `{{args.invoice_id}}`: validated command argument
- `{{auth.csrf_token}}`: provider-supplied non-persisted auth value
- `{{steps.bootstrap.data.account_id}}`: prior command result
- `{{env.NAME}}`: process environment
- `{{runtime.now}}` and `{{runtime.uuid}}`: generated execution values

A reference occupying the full string preserves its value type. Embedded references become strings. Missing references fail before sending the request.

`request.kind` is `http`, `graphql`, `websocket`, or `browser`. HTTP supports JSON/raw bodies, URL-encoded forms, multipart files, query parameters, content types, and timeouts. GraphQL stores operation text/name and variables. WebSocket stores protocols, messages, response matching, and timeout. Browser requests can contain agent instructions or executable structured steps.

Site metadata can describe API families, dynamic values, cookies/CSRF/refresh session behavior, known errors, rate-limit observations, expected content types, examples, confidence, and repair provenance. Version `1.1` identifies definitions using the expanded transports; `1.0` remains accepted.

See `examples/sites/demo.local.yaml` for a complete definition.
