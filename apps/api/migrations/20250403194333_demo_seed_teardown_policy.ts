import type { Knex } from 'knex';

/**
 * Demo seed teardown is infrastructure cleanup for disposable demo workspaces.
 * Immutable business tables call this helper from hard-delete guards so demo
 * reset can purge demo-owned fixtures without weakening production invariants.
 */

const schemaName = 'app';
const functionName = 'is_demo_seed_teardown_allowed';

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE OR REPLACE FUNCTION "${schemaName}".${functionName}(target_company_id uuid)
    RETURNS boolean AS $$
      SELECT COALESCE(current_setting('app.demo_seed_teardown', true), '') = 'on'
        AND EXISTS (
          SELECT 1
          FROM "${schemaName}".companies
          WHERE id = target_company_id
            AND workspace_class = 'demo'
        );
    $$ LANGUAGE sql STABLE;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(
    `DROP FUNCTION IF EXISTS "${schemaName}".${functionName}(uuid)`,
  );
}
