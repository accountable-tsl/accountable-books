import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('seed_runs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));
    table.text('name').notNullable(); // e.g. 'demo:individual'
    table.integer('version').notNullable(); // bump when logic changes
    table.specificType('tags', 'text[]').notNullable(); // e.g. '{demo,tenant}'
    table.jsonb('params').notNullable(); // {"companyId":"…","variant":"owner"}
    table.text('checksum').notNullable(); // sha256(name,version,params)
    table.timestamp('applied_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    // Ensure idempotency
    table.unique(['name', 'version', 'checksum', 'params']);
  });

  await knex.schema.createTable('seed_artifacts', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));
    table.uuid('run_id').notNullable().references('seed_runs.id').onDelete('CASCADE');
    table.text('table_name').notNullable();
    table.jsonb('pk').notNullable(); // {"id":"…"} or {"company_id":"…","email":"…"}
    table.uuid('company_id'); // denormalized for fast targeting
    table.text('op').notNullable().defaultTo('upsert');
    table.text('checksum');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(['company_id', 'table_name']);
    table.index('run_id');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('seed_artifacts');
  await knex.schema.dropTableIfExists('seed_runs');
}
