import { describe, expect, it } from 'vitest';

import { getTestDb } from '../../../../../config/test-db.js';
import {
  purgeProviderWebhookPayloads,
  WEBHOOK_PAYLOAD_RETENTION_DAYS,
} from '../bank-provider-webhook-events.model.js';

describe('purgeProviderWebhookPayloads', () => {
  it('clears payloads on terminal events past retention and leaves recent ones', async () => {
    const db = getTestDb();

    const [oldCompleted] = await db('bank_provider_webhook_events')
      .insert({
        provider_key: 'plaid',
        provider_item_id: 'item-old',
        event_type: 'TRANSACTIONS',
        event_code: 'SYNC_UPDATES_AVAILABLE',
        dedupe_key: `purge-old-completed-${Date.now()}`,
        payload: { secretish: 'keep-for-audit-window' },
        status: 'completed',
        processed_at: db.raw(`now() - (interval '1 day' * ?)`, [
          WEBHOOK_PAYLOAD_RETENTION_DAYS + 1,
        ]),
      })
      .returning('id');

    const [recentCompleted] = await db('bank_provider_webhook_events')
      .insert({
        provider_key: 'plaid',
        provider_item_id: 'item-recent',
        event_type: 'TRANSACTIONS',
        event_code: 'SYNC_UPDATES_AVAILABLE',
        dedupe_key: `purge-recent-${Date.now()}`,
        payload: { still: 'here' },
        status: 'completed',
        processed_at: db.raw(`now() - interval '1 day'`),
      })
      .returning('id');

    const [pending] = await db('bank_provider_webhook_events')
      .insert({
        provider_key: 'plaid',
        provider_item_id: 'item-pending',
        event_type: 'ITEM',
        event_code: 'ERROR',
        dedupe_key: `purge-pending-${Date.now()}`,
        payload: { pending: true },
        status: 'pending',
        processed_at: null,
      })
      .returning('id');

    try {
      const result = await purgeProviderWebhookPayloads();
      expect(result.cleared).toBeGreaterThanOrEqual(1);

      const oldRow = await db('bank_provider_webhook_events')
        .where({ id: oldCompleted.id })
        .first('payload', 'status');
      expect(oldRow?.status).toBe('completed');
      expect(oldRow?.payload).toBeNull();

      const recentRow = await db('bank_provider_webhook_events')
        .where({ id: recentCompleted.id })
        .first('payload');
      expect(recentRow?.payload).toEqual({ still: 'here' });

      const pendingRow = await db('bank_provider_webhook_events')
        .where({ id: pending.id })
        .first('payload');
      expect(pendingRow?.payload).toEqual({ pending: true });
    } finally {
      await db('bank_provider_webhook_events')
        .whereIn('id', [oldCompleted.id, recentCompleted.id, pending.id])
        .del();
    }
  });
});
