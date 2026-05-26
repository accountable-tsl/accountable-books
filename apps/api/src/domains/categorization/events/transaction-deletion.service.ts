import type { Knex } from 'knex';

import { knexClient } from '../../../db/knexClient.js';
import { getLogger } from '../../../shared/utils/logger.js';
import { decrementContactStats } from '../stats/stats.service.js';
import { softDeleteCategorizationTasks } from '../tasks/tasks.service.js';

const logger = getLogger({ component: 'transaction-deletion-service' });

export async function handleTransactionsDeleted({
  bankTransactionIds,
  reason,
  trx,
}: {
  bankTransactionIds: string[];
  reason?: string | null;
  trx?: Knex.Transaction;
}): Promise<void> {
  if (bankTransactionIds.length === 0) {
    return;
  }

  const exec = async (tx: Knex.Transaction) => {
    const deletedTasks = await softDeleteCategorizationTasks({
      bankTransactionIds,
      reason,
      trx: tx,
    });

    for (const bankTransactionId of bankTransactionIds) {
      await decrementContactStats({ bankTransactionId }, tx);
    }

    logger.info(
      {
        bankTransactionIds,
        deletedTasks,
      },
      'Applied categorization cleanup for deleted transactions',
    );
  };

  if (trx) {
    await exec(trx);
  } else {
    await knexClient.transaction(exec);
  }
}
