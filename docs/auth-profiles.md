# Authentication and profiles

Specs declare an auth provider ID and required dynamic names; they never contain credentials. Runtime providers return request headers plus values addressable through `{{auth.*}}`.

`browser-session` reads Playwright storage state from `~/.anything-to-api/sessions/<domain>.json`. `anything discover` creates or updates this file automatically. Keep this directory owner-readable only and never commit it.

Environment provider resolves requirements as `ANYTHING_AUTH_<SITE_ID>_<NAME>`. It supplies values, suitable for references such as `{{auth.api_token}}`.

Profiles support accounts without putting secrets in profile JSON:

```json
{
  "version": 1,
  "name": "work",
  "site": "example.com",
  "provider": "profile:work",
  "headers": {
    "authorization": { "service": "anything-to-api", "account": "example-work-token" }
  }
}
```

Use `anything --profile ~/.anything-to-api/profiles/work.json call example.com list_invoices`. On macOS, keychain references use `security find-generic-password`; Linux uses `secret-tool`. Literal profile fields are for non-secret routing values only.
