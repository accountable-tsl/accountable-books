import type { LanguageModelUsage } from 'ai';
import type { Knex } from 'knex';

import { knexClient } from '../../../db/knexClient.js';
import { logger } from '../../../shared/index.js';
import {
  estimateCostUsdMicros,
  getEffectiveModelPricing,
} from './ai-pricing.model.js';

import type { AiChatRunStatus, AiProvider } from './ai-telemetry.types.js';

type ChatRunRow = {
  id: string;
  company_id: string;
  user_id: string;
  capability_id: string;
  domain: string | null;
  provider: AiProvider;
  model: string;
  status: AiChatRunStatus;
  finish_reason: string | null;
  request_message_count: number;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  input_cost_usd_micros: number | null;
  output_cost_usd_micros: number | null;
  total_cost_usd_micros: number | null;
  started_at: Date;
  finished_at: Date | null;
  error_text: string | null;
  metadata: unknown;
};

export type CreateChatRunInput = {
  companyId: string;
  userId: string;
  capabilityId: string;
  domain?: string;
  provider: AiProvider;
  model: string;
  requestMessageCount: number;
  startedAt: Date;
  metadata?: Record<string, unknown>;
};

export async function createChatRun(
  input: CreateChatRunInput,
  trx?: Knex.Transaction,
): Promise<{ id: string }> {
  const db = trx ?? knexClient;

  const [row] = (await db('ai_chat_runs')
    .insert({
      company_id: input.companyId,
      user_id: input.userId,
      capability_id: input.capabilityId,
      domain: input.domain ?? null,
      provider: input.provider,
      model: input.model,
      status: 'running',
      finish_reason: null,
      request_message_count: input.requestMessageCount,
      input_tokens: null,
      output_tokens: null,
      total_tokens: null,
      input_cost_usd_micros: null,
      output_cost_usd_micros: null,
      total_cost_usd_micros: null,
      started_at: input.startedAt,
      finished_at: null,
      error_text: null,
      metadata: input.metadata ?? {},
    })
    .returning(['id'])) as Pick<ChatRunRow, 'id'>[];

  if (!row?.id) throw new Error('Failed to create ai_chat_run');
  return { id: row.id };
}

export async function finishChatRun(params: {
  chatRunId: string;
  status: Exclude<AiChatRunStatus, 'running'>;
  finishReason?: string | null;
  usage?: LanguageModelUsage;
  finishedAt: Date;
  errorText?: string | null;
  trx?: Knex.Transaction;
}): Promise<{
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  inputCostUsdMicros: number | null;
  outputCostUsdMicros: number | null;
  totalCostUsdMicros: number | null;
}> {
  const exec = async (trx: Knex.Transaction) => {
    const row = (await trx('ai_chat_runs')
      .where({ id: params.chatRunId, is_deleted: false })
      .forUpdate()
      .first()) as ChatRunRow | undefined;

    if (!row) {
      logger.warn(
        { chatRunId: params.chatRunId },
        'ai_chat_run not found to finish',
      );
      return {
        inputTokens: null,
        outputTokens: null,
        totalTokens: null,
        inputCostUsdMicros: null,
        outputCostUsdMicros: null,
        totalCostUsdMicros: null,
      };
    }

    const inputTokens = params.usage?.inputTokens ?? undefined;
    const outputTokens = params.usage?.outputTokens ?? undefined;
    const totalTokens = params.usage?.totalTokens ?? undefined;

    const pricing = await getEffectiveModelPricing({
      provider: row.provider,
      model: row.model,
      at: row.started_at,
      trx,
    });

    let inputCostUsdMicros: number | null = null;
    let outputCostUsdMicros: number | null = null;
    let totalCostUsdMicros: number | null = null;

    if (pricing && (inputTokens != null || outputTokens != null)) {
      const cost = estimateCostUsdMicros({
        pricing,
        inputTokens: inputTokens ?? 0,
        outputTokens: outputTokens ?? 0,
      });
      inputCostUsdMicros = cost.inputCostUsdMicros;
      outputCostUsdMicros = cost.outputCostUsdMicros;
      totalCostUsdMicros = cost.totalCostUsdMicros;
    }

    await trx('ai_chat_runs')
      .where({ id: params.chatRunId })
      .update({
        status: params.status,
        finish_reason: params.finishReason ?? null,
        input_tokens: inputTokens ?? null,
        output_tokens: outputTokens ?? null,
        total_tokens: totalTokens ?? null,
        input_cost_usd_micros: inputCostUsdMicros,
        output_cost_usd_micros: outputCostUsdMicros,
        total_cost_usd_micros: totalCostUsdMicros,
        finished_at: params.finishedAt,
        error_text: params.errorText ?? null,
      });

    return {
      inputTokens: inputTokens ?? null,
      outputTokens: outputTokens ?? null,
      totalTokens: totalTokens ?? null,
      inputCostUsdMicros,
      outputCostUsdMicros,
      totalCostUsdMicros,
    };
  };

  if (params.trx) return await exec(params.trx);
  return await knexClient.transaction(exec);
}
