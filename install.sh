#!/usr/bin/env bash
set -euo pipefail

REPOSITORY_URL="${ANYTHING_REPOSITORY_URL:-https://github.com/vrlda/anything-to-api-skill.git}"
INSTALL_ROOT="${ANYTHING_INSTALL_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/anything-to-api}"
PNPM_VERSION="11.20.0"

command -v git >/dev/null || { echo "anything: git is required" >&2; exit 1; }
command -v node >/dev/null || { echo "anything: Node.js 20+ is required" >&2; exit 1; }
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 20 ]; then echo "anything: Node.js 20+ is required" >&2; exit 1; fi

mkdir -p "$(dirname "$INSTALL_ROOT")"
if [ -d "$INSTALL_ROOT/.git" ]; then
  git -C "$INSTALL_ROOT" pull --ff-only
elif [ -e "$INSTALL_ROOT" ]; then
  echo "anything: $INSTALL_ROOT exists but is not an Anything-to-API checkout" >&2
  exit 1
else
  git clone --depth 1 "$REPOSITORY_URL" "$INSTALL_ROOT"
fi

cd "$INSTALL_ROOT"
npx --yes "pnpm@$PNPM_VERSION" install --frozen-lockfile
npx --yes "pnpm@$PNPM_VERSION" build
if [ "${ANYTHING_SKIP_BROWSER_INSTALL:-0}" != "1" ]; then
  npx --yes "pnpm@$PNPM_VERSION" --filter @anything-to-api/browser-adapter exec playwright install chromium
fi
chmod +x packages/cli/dist/index.js
chmod +x skills/anything-to-api/scripts/runtime.sh

install_skill() {
  local destination="$1/anything-to-api"
  mkdir -p "$1"
  if [ -d "$destination" ] && [ ! -L "$destination" ]; then
    echo "anything: kept existing skill directory $destination" >&2
  else
    ln -sfn "$INSTALL_ROOT/skills/anything-to-api" "$destination"
  fi
}

install_skill "${ANYTHING_SKILLS_DIR:-$HOME/.agents/skills}"
install_skill "$HOME/.claude/skills"
install_skill "$HOME/.config/opencode/skills"
if [ -d "${CODEX_HOME:-$HOME/.codex}" ]; then install_skill "${CODEX_HOME:-$HOME/.codex}/skills"; fi

VERSION="$(node packages/cli/dist/index.js --version)"
echo "Anything-to-API skill v$VERSION installed."
echo "Ask your agent: /api https://example.com"
