import type { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';

import { knexClient } from '../../db/knexClient.js';
import { logger } from '../../shared/index.js';

export type AiChatThreadRow = {
  id: string;
  company_id: string;
  user_id: string;
  firm_id: string | null;
  title: string | null;
  is_deleted: boolean;
  last_message_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type AiChatMessageRow = {
  id: string;
  thread_id: string;
  company_id: string;
  user_id: string;
  firm_id: string | null;
  client_message_id: string | null;
  role: 'user' | 'assistant' | 'system';
  text: string;
  meta: unknown;
  chat_run_id: string | null;
  occurred_at: Date;
  created_at: Date;
};

export type CreateThreadInput = {
  companyId: string;
  userId: string;
  firmId?: string;
  title?: string;
};

export async function createChatThread(
  input: CreateThreadInput,
  trx?: Knex.Transaction,
): Promise<AiChatThreadRow> {
  const db = trx ?? knexClient;
  const id = uuidv4();

  const [row] = await db('ai_chat_threads')
    .insert({
      id,
      company_id: input.companyId,
      user_id: input.userId,
      firm_id: input.firmId ?? null,
      title: input.title ?? null,
      is_deleted: false,
      last_message_at: new Date(),
    })
    .returning('*');

  return row as AiChatThreadRow;
}

export async function getChatThreads(
  params: {
    companyId: string;
    userId: string;
    limit?: number;
    // TODO: Add cursor-based pagination
  },
  trx?: Knex.Transaction,
): Promise<AiChatThreadRow[]> {
  const db = trx ?? knexClient;
  const limit = params.limit ?? 50;

  const rows = await db('ai_chat_threads')
    .where({
      company_id: params.companyId,
      user_id: params.userId,
      is_deleted: false,
    })
    .orderBy('last_message_at', 'desc')
    .limit(limit);

  return rows as AiChatThreadRow[];
}

export async function getChatThreadById(
  threadId: string,
  companyId: string,
  userId: string,
  trx?: Knex.Transaction,
): Promise<AiChatThreadRow | undefined> {
  const db = trx ?? knexClient;
  const row = await db('ai_chat_threads')
    .where({
      id: threadId,
      company_id: companyId,
      user_id: userId,
      is_deleted: false,
    })
    .first();
  return row as AiChatThreadRow | undefined;
}

export type UpsertMessageInput = {
  threadId: string;
  companyId: string;
  userId: string;
  firmId?: string;
  clientMessageId?: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  meta?: Record<string, unknown>;
  chatRunId?: string;
  occurredAt?: Date;
};

/**
 * Upserts a message. Ensures idempotency via clientMessageId if provided.
 */
export async function upsertChatMessage(
  input: UpsertMessageInput,
  trx?: Knex.Transaction,
): Promise<AiChatMessageRow> {
  const db = trx ?? knexClient;
  const id = uuidv4();
  const occurredAt = input.occurredAt ?? new Date();

  // If client_message_id is provided, we can use ON CONFLICT to ignore or update
  // Knex raw is sometimes needed for complex partial indexes, but we have a unique constraint
  // on (thread_id, client_message_id) so we can do an insert onConflict.merge

  const data = {
    id,
    thread_id: input.threadId,
    company_id: input.companyId,
    user_id: input.userId,
    firm_id: input.firmId ?? null,
    client_message_id: input.clientMessageId ?? null,
    role: input.role,
    text: input.text,
    meta: input.meta ?? null,
    chat_run_id: input.chatRunId ?? null,
    occurred_at: occurredAt,
  };

  if (input.clientMessageId) {
    const [row] = await db('ai_chat_messages')
      .insert(data)
      .onConflict(['thread_id', 'client_message_id'])
      .merge(['text', 'meta', 'chat_run_id']) // Update fields if it already exists
      .returning('*');

    return row as AiChatMessageRow;
  }

  const [row] = await db('ai_chat_messages').insert(data).returning('*');

  return row as AiChatMessageRow;
}

export async function updateThreadLastMessageAt(
  threadId: string,
  occurredAt: Date,
  trx?: Knex.Transaction,
) {
  const db = trx ?? knexClient;
  await db('ai_chat_threads').where({ id: threadId }).update({
    last_message_at: occurredAt,
    updated_at: new Date(),
  });
}

export async function getChatThreadMessages(
  params: {
    threadId: string;
    companyId: string;
    userId: string;
    limit?: number;
    offset?: number;
  },
  trx?: Knex.Transaction,
): Promise<AiChatMessageRow[]> {
  const db = trx ?? knexClient;
  const limit = params.limit ?? 100;

  // Typical UX is fetching the *most recent* 100 messages, then ordering them chronologically
  // So we order by occurred_at DESC, limit, then reverse in app layer, or we can use a subquery
  // We'll fetch descending then reverse in memory to ensure we get the latest N.

  const rows = await db('ai_chat_messages')
    .where({
      thread_id: params.threadId,
      company_id: params.companyId,
      user_id: params.userId,
    })
    .orderBy('occurred_at', 'desc')
    .limit(limit)
    .offset(params.offset ?? 0);

  return (rows as AiChatMessageRow[]).reverse();
}
