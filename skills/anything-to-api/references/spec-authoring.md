# Spec authoring

Use schema version supported by installed `@anything-to-api/schema`. Inspect project `docs/site-spec.md` and a current example rather than guessing fields.

Command names describe intent (`list_invoices`, `download_invoice`), not route shape. Keep argument contracts stable across repairs. Use full-value references to preserve types and embedded references for string interpolation:

```yaml
request:
  kind: http
  method: GET
  url: /api/invoices/{{args.invoice_id}}
  headers:
    x-csrf-token: "{{auth.csrf_token}}"
```

Auth section names provider and non-secret requirements. Provider retrieves cookies/tokens/session state at runtime. Never paste observed secret values into examples, provenance, headers, or notes.

Use prerequisites when a reusable bootstrap command produces dynamic values. Name each step with `as`, then refer to `{{steps.<as>.data.*}}` or `{{steps.<as>.extracted.*}}`. Use cursor pagination only when next cursor and item collection paths are known.

Use `uiFallback` for a known recovery path when direct transport exists but may fail. Use a browser request as primary implementation only when no reliable direct operation exists. Explain browser coupling in provenance notes.

Validation states mean:

- `unverified`: inferred or captured but not independently replayed
- `verified`: successfully executed through runtime with expected result
- `broken`: previously valid and now reproducibly fails

Set confidence from evidence, not optimism. Update `lastSuccess` only after runtime execution.
