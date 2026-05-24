import type { Knex } from 'knex';

export async function up(_knex: Knex): Promise<void> {
  // Business workspace bootstrap moved to app-layer bootstrap commands/services.
  // Use `pnpm run bootstrap` (or `seed:system-firms`) after migrate.
}

export async function down(_knex: Knex): Promise<void> {
  // No-op: system firm bootstrap is managed outside migrations.
}
