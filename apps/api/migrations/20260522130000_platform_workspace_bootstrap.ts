import type { Knex } from 'knex';

export async function up(_knex: Knex): Promise<void> {
  // Business workspace bootstrap moved to app-layer bootstrap commands/services.
  // Use `pnpm run bootstrap` (or `bootstrap:platform`) after migrate.
}

export async function down(_knex: Knex): Promise<void> {
  // No-op: platform bootstrap is managed outside migrations.
}
