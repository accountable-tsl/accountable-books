import type { Knex } from 'knex';

import { getLogger } from '../../shared/utils/logger.js';
import { writeOutbox } from '../outbox/index.js';
import { OUTBOX_INTENT } from '../outbox/intents.js';
import { materializeWork } from './work-materialization.js';
import { buildScopeKey } from './work.types.js';

const logger = getLogger({ component: 'work-materialization-intent' });

interface BankAccountMaterializationScope {
  clientCompanyId: string;
  bankAccountId: string;
}

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

  await writeOutbox(trx, {
    intentType: OUTBOX_INTENT.WORK_MATERIALIZATION_REQUESTED,
    scopeKey,
    payload: { scope, ...(input.change ? { change: input.change } : {}) },
  });

  return { scopeKey };
}

export interface FastMaterializationScopeResult {
  scopeKey: string;
  status: 'reconciled' | 'deferred' | 'error';
  refetch: boolean;
}

/** Best-effort post-commit materialization for UX; outbox remains the recovery path. */
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
