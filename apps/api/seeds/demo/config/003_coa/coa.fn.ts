import type { Knex } from 'knex';

import { deleteDemoData } from '../../shared/utils.js';

import type { DemoFilter } from '../../shared/config.js';

export const createDemoCoa = async (
  _trx: Knex.Transaction,
  _filters?: DemoFilter,
) => {
  console.log(
    'Skipping demo COA step because demo company provisioning already ensures chart of accounts',
  );
};

export const deleteDemoCoa = async (
  trx: Knex.Transaction,
  filters?: DemoFilter,
) => {
  await deleteDemoData({
    trx,
    table: 'coa',
    filters,
  });
};
