#!/usr/bin/env sh
set -eu

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "Push blocked: pnpm is required but was not found." >&2
  exit 1
fi

echo "Running push verification: pnpm build"
pnpm build
