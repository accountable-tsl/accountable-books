import { EventEmitter } from 'node:events';
import type { Knex } from 'knex';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { queueBroker } from '../../../jobs/queues/queue-broker.js';
import {
  balanceRecalcQueue,
  mergeBalanceRecalcRanges,
  scheduleGLBalanceAfterCommit,
} from '../balance-recalc.queue.js';

describe('balance recalculation queue coverage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    queueBroker.configure({ disableAll: true, logSkipped: true });
  });

  it('keeps a merged range open-ended when either side is open-ended', () => {
    expect(
      mergeBalanceRecalcRanges('2025-01-15', '2025-02-01', '2025-02-28'),
    ).toEqual({ from: '2025-01-15', to: undefined });

    expect(
      mergeBalanceRecalcRanges(
        '2025-02-01',
        '2025-02-28',
        '2025-01-15',
        undefined,
      ),
    ).toEqual({ from: '2025-01-15', to: undefined });
  });

  it('publishes GL balance recalculation only after transaction commit', async () => {
    queueBroker.configure({ disableAll: false, logSkipped: false });

    const getJob = vi
      .spyOn(balanceRecalcQueue, 'getJob')
      .mockResolvedValue(undefined);
    const add = vi
      .spyOn(balanceRecalcQueue, 'add')
      .mockResolvedValue({ id: 'gl-job' } as any);
    const trx = new EventEmitter() as Knex.Transaction;

    await scheduleGLBalanceAfterCommit(
      {
        companyId: '9f6e1e7a-8a07-4f45-b1f0-5024f92c3377',
        coaId: '24b7027c-166d-4d6e-8f2d-14062e33f08d',
        recalcFrom: '2025-01-15',
        triggeredBy: 'ledger_entry',
      },
      trx,
    );

    expect(getJob).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();

    trx.emit('commit');
    await new Promise((resolve) => setImmediate(resolve));

    expect(getJob).toHaveBeenCalledWith(
      'gl-9f6e1e7a-8a07-4f45-b1f0-5024f92c3377-24b7027c-166d-4d6e-8f2d-14062e33f08d',
    );
    expect(add).toHaveBeenCalledWith(
      'gl-balance',
      expect.objectContaining({
        type: 'gl-balance',
        companyId: '9f6e1e7a-8a07-4f45-b1f0-5024f92c3377',
        coaId: '24b7027c-166d-4d6e-8f2d-14062e33f08d',
        recalcFrom: '2025-01-15',
        triggeredBy: 'ledger_entry',
      }),
      expect.objectContaining({
        jobId:
          'gl-9f6e1e7a-8a07-4f45-b1f0-5024f92c3377-24b7027c-166d-4d6e-8f2d-14062e33f08d',
      }),
    );
  });
});
