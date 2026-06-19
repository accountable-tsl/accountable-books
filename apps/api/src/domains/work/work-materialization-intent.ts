import type { Knex } from 'knex';

import { getLogger } from '../../shared/utils/logger.js';
import { writeOutboxIntent } from './outbox.model.js';
import { materializeWork } from './work-materialization.js';
import { buildScopeKey, OUTBOX_INTENT } from './work.types.js';

const logger = getLogger({ component: 'work-materialization-intent' });

interface BankAccountMaterializationScope {
  clientCompanyId: string;
  bankAccountId: string;
}

/**
 * Write a durable `work_materialization_requested` outbox intent for a single
 * `bank_account` scope.
 *
 * MUST be called with the same `trx` as the owning domain fact (inserted bank
 * transactions, posted ledger facts) so the intent is committed atomically and
 * never exists for rolled-back work. Reconciliation reads current domain facts,
 * so the optional `change` descriptor is telemetry only.
 *
 * This is the single place that constructs the bank-account materialization
 * scope + payload, so the bank-import and manual-post paths cannot drift. When
 * Phase D1 makes `createLedgerRecord` the materialization owner for all ledger
 * writes, ledger-write callers should move to that owner and stop writing here.
 */
export async function writeBankAccountWorkMaterializationIntent(
  trx: Knex.Transaction,
  input: BankAccountMaterializationScope & {
    change?: Record<string, unknown>;
  },
): Promise<{ scopeKey: string }> {
  const scope = {
    type: 'bank_account' as const,
    clientCompanyId: input.clientCompanyId,
    bankAccountId: input.bankAccountId,
  };
  const scopeKey = buildScopeKey(scope);

  await writeOutboxIntent(trx, {
    intentType: OUTBOX_INTENT.WORK_MATERIALIZATION_REQUESTED,
    scopeKey,
    payload: { scope, ...(input.change ? { change: input.change } : {}) },
  });

  return { scopeKey };
}

export interface FastMaterializationScopeResult {
  scopeKey: string;
  status: 'reconciled' | 'deferred' | 'error';
  /** True when the caller/UI should refetch the queue; the outbox worker will reconcile. */
  refetch: boolean;
}

/**
 * Best-effort inline materialization for a set of bank-account scopes, run AFTER
 * the owning transaction has committed. This is a UX accelerator so solved work
 * leaves the queue immediately; the durable outbox intent remains the
 * correctness/recovery path.
 *
 * Never throws: a deferred scope (advisory lock busy) or an unexpected failure
 * is reported as metadata with `refetch: true`, and posted accounting facts are
 * never rolled back on its behalf.
 */
export async function fastMaterializeBankAccountScopes(
  scopes: BankAccountMaterializationScope[],
): Promise<FastMaterializationScopeResult[]> {
  const results: FastMaterializationScopeResult[] = [];

  for (const input of scopes) {
    const scope = {
      type: 'bank_account' as const,
      clientCompanyId: input.clientCompanyId,
      bankAccountId: input.bankAccountId,
    };
    const scopeKey = buildScopeKey(scope);

    try {
      const result = await materializeWork(scope);
      results.push({
        scopeKey,
        status: result.status === 'deferred' ? 'deferred' : 'reconciled',
        refetch: result.status === 'deferred',
      });
    } catch (error) {
      logger.error(
        {
          scopeKey,
          error: error instanceof Error ? error.message : String(error),
        },
        'Inline fast materialization failed; durable outbox will reconcile',
      );
      results.push({ scopeKey, status: 'error', refetch: true });
    }
  }

  return results;
}
