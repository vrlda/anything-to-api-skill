# Internal runtime helper

This reference is for agent execution. Do not make users translate requests into these commands.

Run helper relative to skill directory:

```bash
scripts/runtime.sh sites
scripts/runtime.sh commands <site>
scripts/runtime.sh describe <site> <command>
scripts/runtime.sh validate <site-spec-path>
scripts/runtime.sh call <site> <command> --arg key=value
scripts/runtime.sh call <site> <command> --arg key=value --output <path>
```

Add `--yes` only after explicit user authorization for write, destructive, financial, or external-communication effects. Never infer authorization from installation, discovery, or an earlier unrelated action.

Shared registry defaults to `~/.anything-to-api/sites`; sessions default to `~/.anything-to-api/sessions`. Programmatic projects can import packages from repository installation or bundle specs under `anything/sites`.

If helper reports missing build artifacts, rerun repository installer. Do not install arbitrary packages from target websites.
