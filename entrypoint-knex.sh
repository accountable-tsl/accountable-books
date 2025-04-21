#!/bin/sh
echo "Script is running"
set -e

echo "Running Knex migrations..."

npx tsx node_modules/knex/bin/cli.js migrate:latest --knexfile ./knexfile.ts

sleep 5

echo "Applying raw SQL files..."
for f in ./migrations/sql/*.sql; do
  [ -e "$f" ] || continue
  echo "Applying $f..."
  if psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"; then
    echo "Successfully applied $f"
  else
    echo "Warning: Failed to apply $f"
  fi
done


# if [ "$SEED_DB" = "true" ]; then
#   echo "Running Knex seed scripts..."
#   npx knex seed:run || echo "No seed script found"
# fi
chown -R appuser:appgroup /app/node_modules

echo "Starting the backend in $NODE_ENV mode..."
exec npm run dev:docker
