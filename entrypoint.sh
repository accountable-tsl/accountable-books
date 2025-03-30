#!/bin/sh
set -e

echo "Running Prisma migrations..."
npx prisma format
npx prisma generate

# 🚀 For development, use `migrate dev`
if [ "$NODE_ENV" = "development" ]; then
  echo "Running Prisma Migrate (Development Mode)..."
  npx prisma migrate dev --name init --skip-seed
else
  echo "Running Prisma Migrate ($NODE_ENV Mode)..."
  npx prisma migrate deploy
fi

echo "Applying additional schema modifications..."
npx prisma db execute --file ./prisma/schema.sql || echo "No additional schema changes needed"

if [ "$SEED_DB" = "true" ]; then
  echo "Seeding the database..."
  npm run seed || echo "No seed script found"
fi

chown -R appuser:appgroup /app/node_modules

echo "Starting the backend in $NODE_ENV mode..."
exec npm run dev:docker
