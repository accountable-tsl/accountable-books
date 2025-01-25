#!/bin/sh
set -e

# Wait for PostgreSQL to be ready
until pg_isready -h db -U ${DB_USER} -d ${DB_NAME}; do
  echo "Waiting for database connection..."
  sleep 2
done

# Run migrations
npx prisma migrate deploy

# Seed database if needed
if [ "$SEED_DATABASE" = "true" ]; then
  npm run seed
fi

# Start application
exec "$@"