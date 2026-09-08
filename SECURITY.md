# Security policy

Report vulnerabilities through the repository's [private vulnerability reporting form](https://github.com/vrlda/anything-to-api-skill/security/advisories/new). Do not open public issues containing credentials, captured sessions, personal data, or exploit details.

Anything-to-API definitions can direct authenticated requests and must be treated as executable code. Review untrusted site specs before use. Never commit `~/.anything-to-api/sessions`, auth profiles containing literals, browser storage state, captures from private accounts, or environment files.

Supported security fixes target the latest `1.x` release.

## Security defaults

Site specifications are treated as untrusted input. By default, the runtime limits network calls to the learned site's registrable domain, blocks public-to-private network pivots, revalidates redirects, scopes browser-session cookies to matching destinations, refuses spec-selected local file paths, and derives a minimum side-effect level from the transport before asking for authorization. Discovery artifacts omit captured request and response bodies, and session files are written with owner-only permissions.

Cross-domain integrations and private-network access require an explicit runtime opt-in. Review learned commands before approving consequential actions.
