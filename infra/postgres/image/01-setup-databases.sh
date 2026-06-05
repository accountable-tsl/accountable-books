#!/usr/bin/env bash
set -euo pipefail

# Configures the primary and test databases to match production structure:
#   - app schema with search_path = 'app, public'
#   - timezone = UTC
#   - required extensions
#
# Mirrors the production setup documented in my-notes/db-setup.md (steps 4–6, 9).
# Runs once on first container init via /docker-entrypoint-initdb.d/.

setup_database() {
  local db_name="$1"

  echo "Setting up database: ${db_name}"

  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$db_name" <<-SQL
    ALTER DATABASE "${db_name}" SET timezone TO 'UTC';
    CREATE SCHEMA IF NOT EXISTS app;
    ALTER DATABASE "${db_name}" SET search_path TO 'app, public';
SQL
}

create_test_database() {
  local test_db="${POSTGRES_DB}_test"

  echo "Creating test database: ${test_db}"
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-SQL
    CREATE DATABASE "${test_db}";
SQL

  # Install the same extensions in the test database (except pg_cron which is bound to one database)
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$test_db" <<-SQL
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
    CREATE EXTENSION IF NOT EXISTS vector;
    CREATE EXTENSION IF NOT EXISTS citext;
    CREATE EXTENSION IF NOT EXISTS unaccent;
    CREATE EXTENSION IF NOT EXISTS btree_gist;
    CREATE EXTENSION IF NOT EXISTS pg_uuidv7;
SQL
}

# Primary database (already created by Docker entrypoint via POSTGRES_DB)
setup_database "$POSTGRES_DB"

# Test database
create_test_database
setup_database "${POSTGRES_DB}_test"

echo "Database initialization complete."
