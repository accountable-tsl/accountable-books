import type { Knex } from 'knex';

import { knexClient } from '../../../db/knexClient.js';

import type { AiProvider } from './ai-telemetry.types.js';

type PricingRow = {
  id: string;
  provider: AiProvider;
  model: string;
  input_usd_micros_per_1m_tokens: string | number;
  output_usd_micros_per_1m_tokens: string | number;
  effective_at: Date;
};

export type ModelPricing = {
  provider: AiProvider;
  model: string;
  inputUsdMicrosPer1MTokens: bigint;
  outputUsdMicrosPer1MTokens: bigint;
  effectiveAt: Date;
};

function toBigInt(v: string | number): bigint {
  // pg bigints often come back as strings.
  return BigInt(typeof v === 'string' ? v : Math.trunc(v));
}

export async function getEffectiveModelPricing(params: {
  provider: AiProvider;
  model: string;
  at?: Date;
  trx?: Knex.Transaction;
}): Promise<ModelPricing | null> {
  const db = params.trx ?? knexClient;
  const at = params.at ?? new Date();

  const row = (await db('ai_model_pricing')
    .where({
      provider: params.provider,
      model: params.model,
      is_deleted: false,
    })
    .andWhere('effective_at', '<=', at)
    .orderBy('effective_at', 'desc')
    .first()) as PricingRow | undefined;

  if (!row) return null;

  return {
    provider: row.provider,
    model: row.model,
    inputUsdMicrosPer1MTokens: toBigInt(row.input_usd_micros_per_1m_tokens),
    outputUsdMicrosPer1MTokens: toBigInt(row.output_usd_micros_per_1m_tokens),
    effectiveAt: row.effective_at,
  };
}

export function estimateCostUsdMicros(params: {
  pricing: ModelPricing;
  inputTokens?: number;
  outputTokens?: number;
}): {
  inputCostUsdMicros: number;
  outputCostUsdMicros: number;
  totalCostUsdMicros: number;
} {
  const inputTokens = Math.max(0, Math.trunc(params.inputTokens ?? 0));
  const outputTokens = Math.max(0, Math.trunc(params.outputTokens ?? 0));

  // costMicros = tokens * (usdMicrosPer1M) / 1e6
  // Add 500_000 for rounding half-up.
  const denom = 1_000_000n;

  const input =
    (BigInt(inputTokens) * params.pricing.inputUsdMicrosPer1MTokens +
      500_000n) /
    denom;
  const output =
    (BigInt(outputTokens) * params.pricing.outputUsdMicrosPer1MTokens +
      500_000n) /
    denom;

  const inputCostUsdMicros = Number(input);
  const outputCostUsdMicros = Number(output);

  return {
    inputCostUsdMicros,
    outputCostUsdMicros,
    totalCostUsdMicros: inputCostUsdMicros + outputCostUsdMicros,
  };
}
