#!/usr/bin/env sh
# feature/web-payroll only: lint/build/test payroll + its workspace deps (pnpm ... filter).
set -eu
export CI=1 TURBO_TELEMETRY_DISABLED=1 TURBO_TERM=plain

[ "$(git symbolic-ref --short HEAD 2>/dev/null)" = feature/web-payroll ] || exit 0

MODE=${1:?usage: $0 pre-commit|pre-push}
FILTER='@accountable-books/web-payroll...'
# payroll app, lockfile, and hook wiring only
ALLOWED='^(apps/web-payroll/|pnpm-lock\.yaml|pnpm-workspace\.yaml|scripts/hooks/|\.husky/)'

out_of_scope() {
  printf '%s\n' "$1" | grep -Ev "$ALLOWED" || true
}

case "$MODE" in
  pre-commit)
    bad=$(out_of_scope "$(git diff --cached --name-only --diff-filter=ACMR)")
    if [ -n "$bad" ]; then
      echo "🟡 Staged outside apps/web-payroll/:"
      echo "$bad" | sed 's/^/   /'
    fi
    pnpm lint-staged
    ;;
  pre-push)
    upstream=$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null || true)
    if [ -n "$upstream" ]; then
      files=$(git diff --name-only "${upstream}"...HEAD)
    else
      files=$(git diff --name-only HEAD)
    fi
    bad=$(out_of_scope "$files")
    if [ -n "$bad" ]; then
      echo "❌ Push includes files outside apps/web-payroll/:"
      echo "$bad" | sed 's/^/   /'
      echo "❌ Keep platform work on chore/bootstrap-catalog-cleanup."
      exit 1
    fi
    ;;
  *)
    echo "usage: $0 pre-commit|pre-push" >&2
    exit 1
    ;;
esac

pnpm --filter "$FILTER" build
pnpm --filter "$FILTER" test
echo "✅ Payroll $MODE checks passed"
