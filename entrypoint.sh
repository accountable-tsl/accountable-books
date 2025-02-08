#!/bin/sh
set -e

echo "Running Prisma migrations..."
npx prisma format
npx prisma generate
npx prisma migrate deploy

echo "Applying additional schema modifications..."
npx prisma db execute --file ./prisma/schema.sql

echo "Seeding the database..."
npm run seed

echo "Starting the backend in development mode..."
exec npm run dev:docker
