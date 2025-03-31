#!/bin/sh
set -e

echo "Running Prisma migrations..."
npx prisma format
npx prisma generate

echo "Waiting for database to be ready..."
until npx prisma migrate status >/dev/null 2>&1; do
  echo "Database not ready yet... retrying in 2s"
  sleep 2
done

# 🚀 For development, use `migrate dev`
if [ "$NODE_ENV" = "development" ]; then
  echo "Running Prisma Migrate (Development Mode)..."
  npx prisma migrate dev --skip-seed
else
  echo "Running Prisma Migrate ($NODE_ENV Mode)..."
  npx prisma migrate deploy
fi

echo "Applying raw SQL schema patches..."
if [ -f "./prisma/post-deploy.sql" ]; then
  npx prisma db execute --file ./prisma/post-deploy.sql || echo "No additional schema changes needed"
else
  echo "No post-deploy.sql file found, skipping..."
fi

if [ "$SEED_DB" = "true" ]; then
  echo "Seeding the database..."
  npm run seed || echo "No seed script found"
fi

chown -R appuser:appgroup /app/node_modules

echo "Starting the backend in $NODE_ENV mode..."
exec npm run dev:docker
