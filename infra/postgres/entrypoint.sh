#!/usr/bin/env bash
set -euo pipefail

# Set default database name for pg_cron if not provided
export POSTGRES_DB="${POSTGRES_DB:-postgres}"

exec /usr/local/bin/docker-entrypoint.sh postgres \
  -c shared_preload_libraries='pg_cron' \
  -c cron.database_name="${POSTGRES_DB}"
