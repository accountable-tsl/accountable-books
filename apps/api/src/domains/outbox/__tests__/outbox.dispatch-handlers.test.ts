import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { knexClient } from '../../../db/knexClient.js';
import { queueBroker } from '../../../jobs/queues/queue-broker.js';
import { writeGlBalanceRecalcOutbox } from '../../balances/gl-balance.outbox.js';
import { glBalanceService } from '../../balances/gl-balance.service.js';
import { writeCloseSignalEvalOutbox } from '../../reporting/close-readiness/signals/close-signal.outbox.js';
import { syncLedgerTransactionSignals } from '../../reporting/close-readiness/signals/close-signals.sync.js';
import { dispatchPendingIntents, OUTBOX_INTENT } from '../index.js';

vi.mock('../../balances/gl-balance.service.js', () => ({
  glBalanceService: {
    recalculateBalance: vi.fn().mockResolvedValue({
      daysProcessed: 0,
      snapshotsCreated: 0,
      finalBalance: 0,
      lastProcessedDate: '2025-01-01',
    }),
  },
}));
vi.mock(
  '../../reporting/close-readiness/signals/close-signals.sync.js',
  () => ({
    syncLedgerTransactionSignals: vi
      .fn()
      .mockResolvedValue({ persisted: 0, removed: 0 }),
  }),
);

describe('outbox dispatch runs the work before marking processed', () => {
  afterEach(() => {
    vi.clearAllMocks();
    queueBroker.configure({ disableAll: true, logSkipped: false });
  });

  it('recalculates GL balances and marks the intent processed', async () => {
    const companyId = randomUUID();
    const coaId = randomUUID();
    const scopeKey = `${OUTBOX_INTENT.GL_BALANCE_RECALC_REQUESTED}:${companyId}:${coaId}`;
    try {
      await knexClient.transaction((trx) =>
        writeGlBalanceRecalcOutbox(trx, {
          companyId,
          coaId,
          recalcFrom: '2025-01-01',
          triggeredBy: 'ledger_entry',
        }),
      );

      const result = await dispatchPendingIntents(1, {
        intentType: OUTBOX_INTENT.GL_BALANCE_RECALC_REQUESTED,
        scopeKey,
      });

      expect(result.processed).toBe(1);
      expect(glBalanceService.recalculateBalance).toHaveBeenCalledTimes(1);
      // Passed the dispatcher's transaction, so work + mark-done are atomic.
      expect(glBalanceService.recalculateBalance).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId,
          coaId,
          recalcFrom: '2025-01-01',
          triggeredBy: 'ledger_entry',
        }),
        expect.anything(),
      );

      const row = await knexClient('app.outbox')
        .where({ scope_key: scopeKey })
        .first('status');
      expect(row?.status).toBe('processed');
    } finally {
      await knexClient('app.outbox').where({ scope_key: scopeKey }).del();
    }
  });

  it('reconciles close signals and marks the intent processed', async () => {
    const companyId = randomUUID();
    const ledgerTransactionId = randomUUID();
    const scopeKey = `${OUTBOX_INTENT.CLOSE_SIGNAL_EVAL_REQUESTED}:${companyId}:${ledgerTransactionId}`;
    try {
      await knexClient.transaction((trx) =>
        writeCloseSignalEvalOutbox(trx, {
          companyId,
          ledgerTransactionId,
          triggeredBy: 'ledger_write',
        }),
      );

      const result = await dispatchPendingIntents(1, {
        intentType: OUTBOX_INTENT.CLOSE_SIGNAL_EVAL_REQUESTED,
        scopeKey,
      });

      expect(result.processed).toBe(1);
      expect(syncLedgerTransactionSignals).toHaveBeenCalledWith(
        ledgerTransactionId,
        expect.anything(),
      );

      const row = await knexClient('app.outbox')
        .where({ scope_key: scopeKey })
        .first('status');
      expect(row?.status).toBe('processed');
    } finally {
      await knexClient('app.outbox').where({ scope_key: scopeKey }).del();
    }
  });
});
