import type { Knex } from 'knex';

import { getLogger } from '../utils/logger.js';

type AfterCommitFn = () => void | Promise<void>;

interface TransactionWithHooks extends Knex.Transaction {
  __afterCommitHooks?: AfterCommitFn[];
  __afterCommitPatched?: boolean;
  __afterCommitRan?: boolean;
}

const logger = getLogger({ component: 'after-transaction-commit' });

async function runHooksOnce(tx: TransactionWithHooks): Promise<void> {
  if (tx.__afterCommitRan) {
    return;
  }
  tx.__afterCommitRan = true;
  const hooks = tx.__afterCommitHooks ?? [];
  tx.__afterCommitHooks = [];

  for (const hook of hooks) {
    try {
      await hook();
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'After-commit hook failed',
      );
    }
  }
}

/**
 * Run `fn` after `trx` successfully commits. Skipped on rollback.
 *
 * Knex transactions do not emit a `commit` event, so production callers rely on
 * a one-time `commit` wrapper. EventEmitter-style transaction mocks can still
 * `emit('commit')`; hooks are guarded so they cannot fire twice.
 */
export function runAfterTransactionCommit(
  trx: Knex.Transaction | undefined,
  fn: AfterCommitFn,
): void {
  if (!trx) {
    void Promise.resolve()
      .then(fn)
      .catch((error) => {
        logger.error(
          { error: error instanceof Error ? error.message : String(error) },
          'After-commit hook failed outside a transaction',
        );
      });
    return;
  }

  const tx = trx as TransactionWithHooks;
  const hooks = tx.__afterCommitHooks ?? [];
  hooks.push(fn);
  tx.__afterCommitHooks = hooks;

  const canPatchCommit = typeof tx.commit === 'function';

  if (!tx.__afterCommitPatched && canPatchCommit) {
    tx.__afterCommitPatched = true;
    const originalCommit = tx.commit.bind(tx) as (
      value?: unknown,
    ) => Promise<unknown>;
    (tx as { commit: (value?: unknown) => Promise<unknown> }).commit = async (
      value?: unknown,
    ) => {
      const result = await originalCommit(value);
      await runHooksOnce(tx);
      return result;
    };
  }

  if (!canPatchCommit && typeof trx.on === 'function') {
    trx.on('commit', () => {
      void runHooksOnce(tx);
    });
  }
}
