#!/usr/bin/env sh
# Branch isolation for apps/web-payroll:
# - Direct edits only on feature/web-payroll
# - Merge feature/web-payroll OUT to other branches (not in)
set -eu

PAYROLL_BRANCH='feature/web-payroll'
PAYROLL_DIR='apps/web-payroll'
PAYROLL_PKG='@accountable-books/web-payroll'
FILTER='@accountable-books/web-payroll...'
ALLOWED='^(apps/web-payroll/|pnpm-lock\.yaml|pnpm-workspace\.yaml|scripts/hooks/|\.husky/)'

current_branch() {
  git symbolic-ref --short HEAD 2>/dev/null || echo ''
}

staged_payroll_files() {
  git diff --cached --name-only --diff-filter=ACMR | grep "^${PAYROLL_DIR}/" || true
}

merging_from_payroll_branch() {
  [ -f .git/MERGE_HEAD ] || return 1
  git branch --contains "$(cat .git/MERGE_HEAD)" 2>/dev/null | grep -q 'feature/web-payroll'
}

guard_scope() {
  branch=$(current_branch)

  if [ "$branch" = "$PAYROLL_BRANCH" ]; then
    if [ -f .git/MERGE_HEAD ] || [ -f .git/CHERRY_PICK_HEAD ]; then
      printf '%s\n' \
        '❌ Don'\''t merge or cherry-pick into feature/web-payroll' \
        '' \
        'Commit payroll changes directly on this branch, then merge OUT:' \
        '  git merge --abort    # or: git cherry-pick --abort' \
        '  git checkout chore/bootstrap-catalog-cleanup' \
        '  git merge feature/web-payroll'
      return 1
    fi
    return 0
  fi

  bad=$(staged_payroll_files)
  [ -z "$bad" ] && return 0

  if [ -f .git/MERGE_HEAD ] && merging_from_payroll_branch; then
    return 0
  fi

  printf '%s\n' \
    '❌ apps/web-payroll/ changes must be committed on feature/web-payroll' \
    ''
  printf '%s\n' "$bad" | sed 's/^/   /'
  printf '%s\n' \
    '' \
    'Fix:' \
    '  git stash push -m "payroll" -- apps/web-payroll' \
    '  git switch feature/web-payroll' \
    '  git stash pop' \
    '  git add apps/web-payroll' \
    '  git commit -m "your message"' \
    '' \
    "Then sync to this branch:" \
    "  git switch ${branch:-your-branch}" \
    '  git merge feature/web-payroll'
  return 1
}

out_of_scope() {
  printf '%s\n' "$1" | grep -Ev "$ALLOWED" || true
}

case "${1:-}" in
  guard-scope)
    guard_scope
    ;;

  pre-commit)
    export CI=1 TURBO_TELEMETRY_DISABLED=1 TURBO_TERM=plain

    bad=$(out_of_scope "$(git diff --cached --name-only --diff-filter=ACMR)")
    if [ -n "$bad" ]; then
      echo "🟡 Staged outside apps/web-payroll/:"
      echo "$bad" | sed 's/^/   /'
    fi

    pnpm lint-staged
    pnpm --filter "$FILTER" build
    pnpm --filter "$FILTER" test
    echo "✅ Payroll pre-commit checks passed"
    ;;

  pre-push)
    export CI=1 TURBO_TELEMETRY_DISABLED=1 TURBO_TERM=plain
    [ "$(current_branch)" = "$PAYROLL_BRANCH" ] || exit 0

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

    pnpm --filter "$FILTER" build
    pnpm --filter "$FILTER" test
    echo "✅ Payroll pre-push checks passed"
    ;;

  *)
    echo "usage: $0 guard-scope|pre-commit|pre-push" >&2
    exit 1
    ;;
esac
