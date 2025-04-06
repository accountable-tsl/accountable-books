#!/bin/sh
set -e

# echo "Running Prisma migrations..."
# npx prisma format
# npx prisma generate

echo "Running Knex migrations..."

npx tsx node_modules/knex/bin/cli.js migrate:latest --knexfile ./knexfile.ts

sleep 5

# 🚀 For development, use `migrate dev`
# if [ "$NODE_ENV" = "development" ]; then

#   if [ ! -d "./prisma/migrations" ] || [ -z "$(ls -A ./prisma/migrations)" ]; then
#     echo "No Prisma migrations found. Please run 'npx prisma migrate dev --name init' locally first."
#     exit 1
#   fi
  
#   echo "Running Prisma Migrate (Development Mode)..."
#   npx prisma migrate dev --skip-seed
# else
#   echo "Running Prisma Migrate ($NODE_ENV Mode)..."
#   npx prisma migrate deploy
# fi

# echo "Applying raw SQL files..."
# for f in ./migrations/sql/*.sql; do
#   [ -e "$f" ] || continue
#   echo "Applying $f..."
#   if psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"; then
#     echo "Successfully applied $f"
#   else
#     echo "Warning: Failed to apply $f"
#   fi
# done

sleep 5

# echo "Applying raw SQL schema patches..."
# if [ -f "./prisma/post-deploy.sql" ]; then
#   npx prisma db execute --file ./prisma/post-deploy.sql || echo "No additional schema changes needed"
# else
#   echo "No post-deploy.sql file found, skipping..."
# fi

# if [ "$SEED_DB" = "true" ]; then
#   echo "Seeding the database..."
#   npm run seed || echo "No seed script found"
# fi

chown -R appuser:appgroup /app/node_modules

echo "Starting the backend in $NODE_ENV mode..."
exec npm run dev:docker
