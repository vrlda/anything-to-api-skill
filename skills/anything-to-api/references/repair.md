# Repair workflow

1. Reproduce through runtime and retain structured error, response status/content type, failing phase, and spec version. Redact auth and response data.
2. Check session/auth expiry before declaring transport broken. Refresh only through configured provider behavior.
3. Use command provenance to repeat smallest associated UI flow while capturing network traffic.
4. Diff old and current transport: URL/version, method, fields, headers, CSRF/bootstrap, persisted hashes, response paths, pagination, and content type.
5. Patch smallest affected command or prerequisite. Preserve semantic name and argument contract when possible; document unavoidable breaking changes.
6. Validate spec, independently replay command, update `updatedAt`, validation state, confidence, provenance, and `lastSuccess`.
7. Retry original user request. If repair would require a consequential external action, obtain explicit authorization immediately before that action.

Do not globally rediscover site for one failure. Expand scope only when evidence shows shared auth/bootstrap/API-family change.
