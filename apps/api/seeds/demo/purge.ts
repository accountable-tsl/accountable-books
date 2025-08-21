import knex from 'knex';
import { knexClient } from '../../src/db/knexClient';

export async function purgeDemoForCompany(companyId: string) {
  await knexClient.transaction(async (trx) => {
    await trx.raw('set constraints all deferred');

    // Delete only rows created by demo seeds for this company
    const arts = await trx('seed_artifacts')
      .join('seed_runs', 'seed_runs.id', 'seed_artifacts.run_id')
      .where('seed_artifacts.company_id', companyId)
      .whereRaw("'demo' = any(seed_runs.tags)")
      .select('seed_artifacts.table_name', 'seed_artifacts.pk');

    // delete in dependency order if needed
    const byTable = new Map<string, any[]>();
    arts.forEach((a) => {
      const arr = byTable.get(a.table_name) ?? [];
      arr.push(a.pk);
      byTable.set(a.table_name, arr);
    });

    for (const t of ['projects', 'contacts', 'users', 'companies']) {
      const pks = byTable.get(t) ?? [];
      for (const pk of pks) await trx(t).where(pk).del();
    }

    // wipe registry rows for this company + tag=demo
    await trx.raw(
      `
        delete from seed_artifacts using seed_runs
        where seed_artifacts.run_id = seed_runs.id
          and seed_artifacts.company_id = ?
          and 'demo' = any(seed_runs.tags)
      `,
      [companyId],
    );
  });
  await knexClient.destroy();
}
