import type { Knex } from "knex";

exports.up = async (knex: Knex) => {
  await knex.raw(`
    CREATE OR REPLACE FUNCTION schedule_partition_cron() 
    RETURNS void AS $$
    BEGIN
      IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'create-banktx-partitions') THEN
        PERFORM cron.unschedule('create-banktx-partitions');
      END IF;
      IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'create-ledger-partitions') THEN
        PERFORM cron.unschedule('create-ledger-partitions');
      END IF;

      PERFORM cron.schedule(
        'create-banktx-partitions',
        CASE 
          WHEN CURRENT_DATE < '2028-01-01' THEN '0 0 1 12 *' 
          ELSE '0 0 1 */3 *'
        END,
        'SELECT create_banktx_partitions();'
      );

      PERFORM cron.schedule(
        'create-ledger-partitions',
        CASE 
          WHEN CURRENT_DATE < '2028-01-01' THEN '0 0 1 12 *' 
          ELSE '0 0 1 */3 *'
        END,
        'SELECT create_ledger_partitions();'
      );
    END;
    $$ LANGUAGE plpgsql;

    SELECT schedule_partition_cron();
  `);
};

exports.down = async (knex: Knex) => {
  await knex.raw(`
    SELECT cron.unschedule('create-banktx-partitions');
    SELECT cron.unschedule('create-ledger-partitions');
    DROP FUNCTION IF EXISTS schedule_partition_cron CASCADE;
  `);
};
