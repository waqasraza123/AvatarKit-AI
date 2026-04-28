#!/usr/bin/env sh
set -eu

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

if [ "${1-}" = "--" ]; then
  shift
fi

"$repo_root/scripts/verify-push.sh"
exec git push "$@"
