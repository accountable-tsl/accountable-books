import type { Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDb } from '../../../../config/test-db.js';
import {
  getTestCompanyId,
  getTestUserId,
  NG_USER_EMAIL,
  US_USER_EMAIL,
} from '../../../../test/helpers.js';
import {
  createChatThread,
  getChatThreadMessages,
  getChatThreads,
  updateThreadLastMessageAt,
  upsertChatMessage,
} from '../ai-chat-history.model.js';

describe('AI Chat History - Integration', () => {
  let trx: Knex.Transaction;
  let companyId: string;
  let companyB: string;
  let userId: string;

  beforeEach(async () => {
    const db = getTestDb();
    trx = await db.transaction();

    // Use existing demo data
    companyId = await getTestCompanyId(trx, 'bizDemoUS');
    companyB = await getTestCompanyId(trx, 'firmDemoNG');
    userId = await getTestUserId(trx, US_USER_EMAIL);
  });

  afterEach(async () => {
    await trx.rollback();
  });

  it('crud lifecycle for threads and messages', async () => {
    // 1. Create a thread
    const thread = await createChatThread(
      {
        companyId,
        userId,
        title: 'Initial Test Thread',
      },
      trx,
    );

    expect(thread.id).toBeTypeOf('string');
    expect(thread.company_id).toBe(companyId);
    expect(thread.title).toBe('Initial Test Thread');

    // 2. Upsert user message
    const msg1 = await upsertChatMessage(
      {
        threadId: thread.id,
        companyId,
        userId,
        clientMessageId: 'msg_client_001',
        role: 'user',
        text: 'Hello world',
        meta: { domain: 'accountable-books' },
      },
      trx,
    );

    expect(msg1.client_message_id).toBe('msg_client_001');
    expect(msg1.role).toBe('user');
    expect(msg1.text).toBe('Hello world');

    // 3. Upsert duplicate user message (Idempotency) - should do nothing or update
    const msg1Dup = await upsertChatMessage(
      {
        threadId: thread.id,
        companyId,
        userId,
        clientMessageId: 'msg_client_001',
        role: 'user',
        text: 'Hello world modified',
        meta: { domain: 'accountable-books' },
      },
      trx,
    );
    expect(msg1Dup.id).toBe(msg1.id);

    // 4. Update thread last message at
    const newDate = new Date();
    await updateThreadLastMessageAt(thread.id, newDate, trx);

    // 5. Fetch threads
    const threads = await getChatThreads({ companyId, userId, limit: 10 }, trx);
    expect(threads).toHaveLength(1);
    expect(threads[0].id).toBe(thread.id);
    expect(
      Math.abs(threads[0].last_message_at!.getTime() - newDate.getTime()),
    ).toBeLessThan(1000);

    // 6. Fetch messages
    const messages = await getChatThreadMessages(
      {
        threadId: thread.id,
        companyId,
        userId,
        limit: 50,
      },
      trx,
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].client_message_id).toBe('msg_client_001');
  });

  it('cross-tenant thread isolation', async () => {
    await createChatThread(
      {
        companyId,
        userId,
        title: 'A Thread',
      },
      trx,
    );
    await createChatThread(
      {
        companyId: companyB,
        userId,
        title: 'B Thread',
      },
      trx,
    );

    const threadsA = await getChatThreads(
      {
        companyId,
        userId,
        limit: 10,
      },
      trx,
    );
    expect(threadsA).toHaveLength(1);
    expect(threadsA[0].title).toBe('A Thread');

    const threadsB = await getChatThreads(
      {
        companyId: companyB,
        userId,
        limit: 10,
      },
      trx,
    );
    expect(threadsB).toHaveLength(1);
    expect(threadsB[0].title).toBe('B Thread');
  });
});
