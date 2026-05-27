import type { Knex } from 'knex';

import { createEnumIfNotExists } from './20250403174454_002_enums.js';
import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

const tableName = 'rules';
export const RULES_TABLE = tableName;

export async function up(knex: Knex): Promise<void> {
  await knex.raw(
    createEnumIfNotExists('rule_scope', [
      'global',
      'region',
      'country',
      'subregion',
      'company',
    ]),
  );

  await knex.schema.createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));
    table.string('name', 200).notNullable();
    table.specificType('scope', 'rule_scope').notNullable();
    table.string('region_code', 32).nullable();
    table.string('country_code', 2).nullable().comment('ISO 3166-1 alpha-2');
    table.string('subregion_code', 32).nullable();
    table
      .uuid('company_id')
      .nullable()
      .references('id')
      .inTable('companies')
      .onDelete('CASCADE');
    table
      .enu('bank_scope', ['all', 'subset', 'single'], {
        enumName: 'rule_bank_scope',
        useNative: true,
      })
      .notNullable()
      .defaultTo('all');
    table.specificType('bank_account_ids', 'uuid[]').nullable();
    table
      .enu('direction_filter', ['all', 'inflow', 'outflow', 'transfer'], {
        enumName: 'rule_direction_filter',
        useNative: true,
      })
      .notNullable()
      .defaultTo('all');
    table.integer('priority').nullable();
    table.boolean('enabled').notNullable().defaultTo(true);
    table.integer('version').notNullable().defaultTo(1);
    table
      .boolean('lock_after_set')
      .notNullable()
      .defaultTo(false)
      .comment(
        'When true, fields mutated by this rule become immutable for lower-tier rules within the same run',
      );
    table
      .uuid('created_by_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('RESTRICT');
    table
      .uuid('updated_by_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table
      .timestamp('published_at', { useTz: true })
      .nullable()
      .comment('When this rule version was published');
    table
      .uuid('published_by')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.string('source', 64).nullable();
    table.jsonb('metadata').notNullable().defaultTo('{}');
    table.specificType(
      'tier_rank',
      `smallint generated always as (
        CASE scope
          WHEN 'global' THEN 1
          WHEN 'region' THEN 2
          WHEN 'country' THEN 3
          WHEN 'subregion' THEN 4
          WHEN 'company' THEN 5
          ELSE 99
        END
      ) stored`,
    );
    table.specificType(
      'order_weight',
      `integer generated always as (
        (
          (
            CASE scope
              WHEN 'global' THEN 1
              WHEN 'region' THEN 2
              WHEN 'country' THEN 3
              WHEN 'subregion' THEN 4
              WHEN 'company' THEN 5
              ELSE 99
            END
          ) * 1000
        ) + COALESCE(priority, 0)
      ) stored`,
    );
    table.specificType(
      'scope_key',
      `text generated always as (
        CASE scope
          WHEN 'global' THEN 'GLOBAL'
          WHEN 'region' THEN 'REGION|' || COALESCE(region_code, '')
          WHEN 'country' THEN 'COUNTRY|' || COALESCE(country_code, '')
          WHEN 'subregion' THEN 'SUBREGION|' || COALESCE(country_code, '') || '|' || COALESCE(subregion_code, '')
          WHEN 'company' THEN 'COMPANY|' || COALESCE(company_id::text, '')
          ELSE 'UNKNOWN'
        END
      ) stored`,
    );

    addStandardColumns(knex, table);
  });

  await createUpdateTimestampTrigger(knex, tableName);

  await knex.raw(`
    ALTER TABLE ${tableName}
    ADD CONSTRAINT rules_scope_location_check
    CHECK (
      (scope = 'global' AND region_code IS NULL AND country_code IS NULL AND subregion_code IS NULL AND company_id IS NULL) OR
      (scope = 'region' AND region_code IS NOT NULL AND country_code IS NULL AND subregion_code IS NULL AND company_id IS NULL) OR
      (scope = 'country' AND country_code IS NOT NULL AND region_code IS NULL AND subregion_code IS NULL AND company_id IS NULL) OR
      (scope = 'subregion' AND country_code IS NOT NULL AND subregion_code IS NOT NULL AND region_code IS NULL AND company_id IS NULL) OR
      (scope = 'company' AND company_id IS NOT NULL AND region_code IS NULL AND country_code IS NULL AND subregion_code IS NULL)
    );
  `);

  await knex.raw(`
    ALTER TABLE ${tableName}
    ADD CONSTRAINT rules_bank_scope_check
    CHECK (
      (bank_scope = 'all' AND bank_account_ids IS NULL) OR
      (bank_scope = 'subset' AND bank_account_ids IS NOT NULL AND cardinality(bank_account_ids) >= 1) OR
      (bank_scope = 'single' AND bank_account_ids IS NOT NULL AND cardinality(bank_account_ids) = 1)
    );
  `);

  await knex.raw(`
    ALTER TABLE ${tableName}
    ADD CONSTRAINT rules_priority_soft_range
    CHECK (priority IS NULL OR (priority BETWEEN -30000 AND 30000));
  `);

  await knex.raw(`
    CREATE INDEX idx_rules_scope_priority
    ON ${tableName} (scope, order_weight)
    WHERE enabled = true AND is_deleted = false;
  `);

  await knex.raw(`
    CREATE INDEX idx_rules_company
    ON ${tableName} (company_id)
    WHERE company_id IS NOT NULL AND is_deleted = false;
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX rules_name_company_version_unique
    ON ${tableName} (
      name,
      COALESCE(company_id, '00000000-0000-0000-0000-000000000000'),
      version
    );
  `);

  await knex.raw(`
    CREATE INDEX idx_rules_scope_geo
    ON ${tableName} (scope, country_code, region_code, subregion_code)
    WHERE enabled = true AND is_deleted = false;
  `);

  await knex.raw(`
    CREATE INDEX idx_rules_scope_key
    ON ${tableName} (scope_key)
    WHERE enabled = true AND is_deleted = false;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS idx_rules_scope_key`);
  await knex.raw(`DROP INDEX IF EXISTS idx_rules_scope_geo`);
  await knex.raw(`DROP INDEX IF EXISTS rules_name_company_version_unique`);
  await knex.raw(`DROP INDEX IF EXISTS idx_rules_company`);
  await knex.raw(`DROP INDEX IF EXISTS idx_rules_scope_priority;`);
  await knex.raw(
    `ALTER TABLE ${tableName} DROP CONSTRAINT IF EXISTS rules_priority_soft_range`,
  );
  await knex.raw(
    `ALTER TABLE ${tableName} DROP CONSTRAINT IF EXISTS rules_bank_scope_check`,
  );
  await knex.raw(
    `ALTER TABLE ${tableName} DROP CONSTRAINT IF EXISTS rules_scope_location_check`,
  );
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTableIfExists(tableName);
  await knex.raw(`DROP TYPE IF EXISTS rule_direction_filter`);
  await knex.raw(`DROP TYPE IF EXISTS rule_bank_scope`);
  await knex.raw(`DROP TYPE IF EXISTS rule_scope`);
}
