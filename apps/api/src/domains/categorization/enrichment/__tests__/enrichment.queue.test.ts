import { EventEmitter } from 'node:events';
import type { Knex } from 'knex';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { queueBroker } from '../../../../jobs/queues/queue-broker.js';
import {
  enrichmentQueue,
  scheduleTransactionEnrichmentAfterCommit,
} from '../enrichment.queue.js';

describe('transaction enrichment queue coverage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    queueBroker.configure({ disableAll: true, logSkipped: true });
  });

  it('publishes enrichment only after transaction commit', async () => {
    queueBroker.configure({ disableAll: false, logSkipped: false });

    const add = vi
      .spyOn(enrichmentQueue, 'add')
      .mockResolvedValue({ id: 'enrichment-job' } as any);
    const trx = new EventEmitter() as Knex.Transaction;

    await scheduleTransactionEnrichmentAfterCommit(
      {
        companyId: '9f6e1e7a-8a07-4f45-b1f0-5024f92c3377',
        bankAccountId: '11111111-2222-4333-8444-555555555555',
        bankTransactionIds: [
          'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
          'ffffffff-1111-4222-8333-444444444444',
        ],
        source: 'ingestion',
      },
      trx,
    );

    expect(add).not.toHaveBeenCalled();

    trx.emit('commit');
    await new Promise((resolve) => setImmediate(resolve));

    expect(add).toHaveBeenCalledWith(
      'enrich-transactions',
      expect.objectContaining({
        companyId: '9f6e1e7a-8a07-4f45-b1f0-5024f92c3377',
        bankAccountId: '11111111-2222-4333-8444-555555555555',
        bankTransactionIds: [
          'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
          'ffffffff-1111-4222-8333-444444444444',
        ],
        source: 'ingestion',
      }),
      expect.objectContaining({
        jobId: expect.stringMatching(
          /^enrichment-9f6e1e7a-8a07-4f45-b1f0-5024f92c3377-\d+$/,
        ),
        priority: 2,
      }),
    );
  });

  it('does not publish enrichment when the transaction rolls back', async () => {
    queueBroker.configure({ disableAll: false, logSkipped: false });

    const add = vi
      .spyOn(enrichmentQueue, 'add')
      .mockResolvedValue({ id: 'enrichment-job' } as any);
    const trx = new EventEmitter() as Knex.Transaction;

    await scheduleTransactionEnrichmentAfterCommit(
      {
        companyId: '9f6e1e7a-8a07-4f45-b1f0-5024f92c3377',
        bankAccountId: '11111111-2222-4333-8444-555555555555',
        bankTransactionIds: ['aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'],
        source: 'ingestion',
      },
      trx,
    );

    trx.emit('rollback');
    await new Promise((resolve) => setImmediate(resolve));

    expect(add).not.toHaveBeenCalled();
  });
});
