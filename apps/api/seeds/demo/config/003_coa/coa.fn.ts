import type { Knex } from 'knex';
import { DemoFilter } from '../../shared/config';
import { deleteDemoData } from '../../shared/utils';

export const deleteDemoCoa = async (trx: Knex.Transaction, filters?: DemoFilter) => {
  await deleteDemoData({
    trx,
    table: 'coa',
    filters,
  });
};
