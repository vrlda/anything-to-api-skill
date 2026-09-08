#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)"
REPOSITORY_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/../../.." && pwd -P)"
CLI="$REPOSITORY_ROOT/packages/cli/dist/index.js"

if [ ! -f "$CLI" ]; then
  echo "Anything-to-API runtime is not built. Re-run installer." >&2
  exit 1
fi

exec node "$CLI" "$@"
