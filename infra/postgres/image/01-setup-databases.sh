#!/usr/bin/env bash
set -euo pipefail

export PGPASSWORD="${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"

if [[ -n "${EXPECTED_POSTGRES_DB:-}" && "$POSTGRES_DB" != "$EXPECTED_POSTGRES_DB" ]]; then
  echo "POSTGRES_DB must be '${EXPECTED_POSTGRES_DB}' for this environment; got '${POSTGRES_DB}'." >&2
  exit 1
fi

# Configures the primary and test databases to match production structure:
#   - app schema with search_path = 'app, public'
#   - timezone = UTC
#   - required extensions
#
# Mirrors the production setup documented in my-notes/db-setup.md (steps 4–6, 9).
# Safe to run repeatedly after PostgreSQL is healthy.

readonly BASE_EXTENSIONS=(
  pgcrypto
  pg_trgm
  vector
  citext
  unaccent
  btree_gist
  pg_uuidv7
)

assert_identifier() {
  local identifier="$1"

  if [[ ! "$identifier" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ]]; then
    echo "Invalid PostgreSQL identifier: ${identifier}" >&2
    exit 1
  fi
}

create_database_if_missing() {
  local db_name="$1"
  local exists

  assert_identifier "$db_name"

  exists="$(
    psql -v ON_ERROR_STOP=1 \
      --username "$POSTGRES_USER" \
      --dbname postgres \
      --tuples-only \
      --no-align \
      --command "SELECT 1 FROM pg_database WHERE datname = '${db_name}'"
  )"

  if [[ "$exists" == "1" ]]; then
    echo "Database already exists: ${db_name}"
    return
  fi

  echo "Creating database: ${db_name}"
  psql -v ON_ERROR_STOP=1 \
    --username "$POSTGRES_USER" \
    --dbname postgres \
    --command "CREATE DATABASE \"${db_name}\""
}

setup_database() {
  local db_name="$1"
  shift
  local extensions=("$@")

  assert_identifier "$db_name"

  echo "Setting up database: ${db_name}"

  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$db_name" <<-SQL
    ALTER DATABASE "${db_name}" SET timezone TO 'UTC';
    CREATE SCHEMA IF NOT EXISTS app;
    ALTER DATABASE "${db_name}" SET search_path TO app, public;
SQL

  for extension in "${extensions[@]}"; do
    psql -v ON_ERROR_STOP=1 \
      --username "$POSTGRES_USER" \
      --dbname "$db_name" \
      --command "CREATE EXTENSION IF NOT EXISTS \"${extension}\""
  done
}

readonly TEST_DB="${POSTGRES_DB}_test"

create_database_if_missing "$POSTGRES_DB"
create_database_if_missing "$TEST_DB"
setup_database "$POSTGRES_DB" "${BASE_EXTENSIONS[@]}" pg_cron
setup_database "$TEST_DB" "${BASE_EXTENSIONS[@]}"

echo "Database provisioning complete."
