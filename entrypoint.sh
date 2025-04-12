#!/bin/sh
set -e

# KNEX

echo "Running Knex migrations..."
npx tsx node_modules/knex/bin/cli.js migrate:latest --knexfile ./knexfile.ts

# sleep 2

# if [ "$NODE_ENV" != "production" ] && [ "$SEED_DB" == "true" ]; then
#   echo "Running seeds..."
#   npx tsx node_modules/knex/bin/cli.js seed:run --knexfile ./knexfile.ts
# fi

# echo "Starting email worker..."
# npx tsx src/jobs/workers/email.worker.ts &

sleep 2

chown -R appuser:appgroup /app/node_modules

sleep 2

echo "Starting the backend in $NODE_ENV mode..."
exec npm run dev:docker
 
 
# PRISMA

# echo "Resetting Prisma DB (dev only)..."
# npx prisma migrate reset --force --skip-seed


# echo "Running Prisma migrations..."
# npx prisma format
# npx prisma generate

# sleep 5

# # 🚀 For development, use `migrate dev`
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


# sleep 5

# echo "Applying raw SQL schema patches..."
# if [ -f "./prisma/post-deploy.sql" ]; then
#   npx prisma db execute --file ./prisma/post-deploy.sql || echo "No additional schema changes needed"
# else
#   echo "No post-deploy.sql file found, skipping..."
# fi


# if [ "$SEED_DB" = "true" ]; then
#   echo "🌱 Seeding the database..."
#   if npm run seed; then
#     echo "✅ Database seeded successfully"
#   else
#     echo "⚠️  Seed script failed or missing"
#   fi
# fi


# chown -R appuser:appgroup /app/node_modules

# sleep 2

# echo "Starting the backend in $NODE_ENV mode..."
# exec npm run dev:docker