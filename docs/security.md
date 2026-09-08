# Security

- Specs are shareable knowledge, not credential stores. Never write passwords, access tokens, session cookies, private keys, or user data into them.
- Auth providers supply headers and dynamic values at execution. Providers cover callbacks, environment lookup, Playwright session reuse, non-secret profiles, and macOS/Linux OS keychains.
- Treat learned definitions as executable code: review them before use, restrict registry write permissions, and avoid untrusted specs. Specs can direct authenticated requests and read response data.
- Use side-effect metadata in agent permission policy. Require explicit authorization immediately before destructive, financial, external-communication, or otherwise consequential execution.
- Discovery redacts known secret fields in headers, URLs, JSON/form requests, and JSON responses. Capture files use owner-only permissions and remain separate from canonical specs. Agents must still inspect and remove personal example data before sharing.
- Direct replay may violate a site's terms or trigger anti-abuse systems. Respect user authority, applicable policy, rate limits, and site constraints.
