#!/usr/bin/env bash
# Nuclear monorepo cleanup: deps, lockfiles, build artifacts, caches, Python venvs.
# Does not remove .env files. Invoked from repo root via `make clean-all`.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

RED='\033[31m'
YELLOW='\033[33m'
GREEN='\033[32m'
NC='\033[0m'

log() { printf '%b%s%b\n' "$YELLOW" "$1" "$NC"; }
log_ok() { printf '%b%s%b\n' "$GREEN" "$1" "$NC"; }

# find .git and node_modules, never traverse them
find_prune() {
  find . \( -name '.git' -o -name 'node_modules' \) -prune -o "$@" 2>/dev/null || true
}

printf '%b\n' "${RED}💥 Nuclear cleanup starting...${NC}"
log '🛑 Stopping infrastructure...'
make db-down || true

shopt -s nullglob

log '🗑️ Removing node_modules...'
rm -rf node_modules apps/*/node_modules packages/*/node_modules || true

log '🗑️ Removing JS lockfiles (pnpm / npm / yarn)...'
find_prune -type f \( \
  -name 'pnpm-lock.yaml' -o -name 'package-lock.json' -o -name 'yarn.lock' -o \
  -name 'npm-shrinkwrap.json' \) -delete

log '🗑️ Removing Python lockfiles (pipenv / uv / pdm)...'
find_prune -type f \( \
  -name 'Pipfile.lock' -o -name 'uv.lock' -o -name 'pdm.lock' \) -delete

log '🗑️ Removing build outputs, bundler caches, deploy metadata, generated trees...'
rm -rf \
  apps/*/dist packages/*/dist dist \
  apps/*/.vite packages/*/.vite \
  apps/*/.next packages/*/.next \
  apps/*/build packages/*/build build \
  apps/*/out packages/*/out out \
  apps/*/dist-ssr packages/*/dist-ssr dist-ssr \
  apps/*/.nitro packages/*/.nitro .nitro \
  apps/*/.tanstack packages/*/.tanstack .tanstack \
  apps/*/.wrangler packages/*/.wrangler .wrangler \
  apps/*/.output packages/*/.output .output \
  apps/*/.swc packages/*/.swc \
  apps/*/test-results packages/*/test-results test-results \
  apps/*/playwright-report packages/*/playwright-report playwright-report \
  .vercel .netlify apps/*/.vercel packages/*/.vercel \
  logs reports htmlcov \
  packages/contracts/accountable_contracts/data/generated \
  packages/api-types/src/generated \
  .pnpm-store .vscode \
  apps/*/coverage packages/*/coverage coverage \
  .turbo apps/*/.turbo packages/*/.turbo \
  || true

rm -f apps/ml-engine/.testmondata 2>/dev/null || true

log '🗑️ Removing incremental files, logs, ESLint cache, Python caches and venvs...'
find_prune -type f \( -name '*.tsbuildinfo' -o -name '.eslintcache' \) -delete
find_prune -type f -name '*.log' -delete
find_prune -type f -name '.coverage' -delete
find_prune -type d \( \
  -name '__pycache__' -o -name '.pytest_cache' -o -name '.mypy_cache' -o -name '.ruff_cache' -o \
  -name '.venv' -o -name '*.egg-info' \) -print0 | xargs -0 rm -rf 2>/dev/null || true

log '📦 Cleaning pnpm cache...'
pnpm store prune || true

log '🐳 Cleaning Docker...'
docker system prune -f || true

# From here on, the tree is already wiped; install/check failures need a clear hint.
on_exit() {
  local ec=$?
  [[ "$ec" -eq 0 ]] && return 0
  printf '\n%b\n' "${RED}clean-all stopped with exit code ${ec} (see output above).${NC}"
  printf '%b\n' "${YELLOW}Artifacts are already removed. After fixing the issue, run:${NC}"
  printf '  %b\n' "${GREEN}pnpm install && make check${NC}"
  exit "$ec"
}
trap on_exit EXIT

log '📦 Reinstalling dependencies...'
set -e
pnpm install

log '🔨 Running quality checks (make check)...'
make check

trap - EXIT
log_ok '✅ Nuclear cleanup complete!'
