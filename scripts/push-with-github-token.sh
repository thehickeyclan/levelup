#!/usr/bin/env bash
# Push using a token from .github-token.local (gitignored). No token in the URL.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BRANCH="${1:-$(git branch --show-current)}"

TOKEN="${GITHUB_TOKEN:-}"
if [[ -z "$TOKEN" && -f "$ROOT/.github-token.local" ]]; then
  TOKEN="$(tr -d '[:space:]' < "$ROOT/.github-token.local" | sed 's/^github_pat_REPLACE_ME$//')"
fi

if [[ -z "$TOKEN" || "$TOKEN" == "github_pat_REPLACE_ME" ]]; then
  echo "Edit .github-token.local — paste your PAT on one line (replace github_pat_REPLACE_ME)." >&2
  exit 1
fi

printf "protocol=https\nhost=github.com\n\n" | git credential-osxkeychain erase 2>/dev/null || true

export GIT_TERMINAL_PROMPT=0
git -c credential.helper= \
  -c "credential.helper=!f() { echo username=thehickeyclan; echo password=${TOKEN}; }; f" \
  push -u origin "$BRANCH"

echo "Done. Pushed ${BRANCH}."
