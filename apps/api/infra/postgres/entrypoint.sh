#!/bin/bash
set -euo pipefail

# Validate required environment variables
: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"
: "${POSTGRES_DB:?POSTGRES_DB is required}"

# Dynamically append cron.database_name to postgresql.conf
# Ensure only one line is added
CONF=etc/postgresql/postgresql.conf
if grep -qE '^[[:space:]]*cron\.database_name[[:space:]]*=' "$CONF"; then
  sed -i "s|^[[:space:]]*cron\.database_name[[:space:]]*=.*$|cron.database_name = '${POSTGRES_DB}'|" "$CONF"
else
  echo "cron.database_name = '${POSTGRES_DB}'" >> "$CONF"
fi

# Start PostgreSQL with custom config
exec docker-entrypoint.sh postgres -c config_file="$CONF"
