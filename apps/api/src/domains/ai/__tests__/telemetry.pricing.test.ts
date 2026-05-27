import type { Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDb } from '../../../../config/test-db.js';
import {
  estimateCostUsdMicros,
  getEffectiveModelPricing,
} from '../telemetry/ai-pricing.model.js';

describe('ai pricing - Integration', () => {
  let trx: Knex.Transaction;

  beforeEach(async () => {
    const db = getTestDb();
    trx = await db.transaction();

    // Ensure a deterministic pricing row exists for this test.
    await trx('ai_model_pricing').insert({
      provider: 'openai',
      model: 'test-model',
      input_usd_micros_per_1m_tokens: 100_000, // $0.10 / 1M
      output_usd_micros_per_1m_tokens: 200_000, // $0.20 / 1M
      effective_at: new Date('2025-01-01T00:00:00.000Z'),
    });
  });

  afterEach(async () => {
    await trx.rollback();
  });

  it('loads effective pricing (latest <= at)', async () => {
    const pricing = await getEffectiveModelPricing({
      provider: 'openai',
      model: 'test-model',
      at: new Date('2026-01-01T00:00:00.000Z'),
      trx,
    });

    expect(pricing).toBeTruthy();
    expect(pricing?.provider).toBe('openai');
    expect(pricing?.model).toBe('test-model');
  });

  it('estimates cost in micros with rounding', async () => {
    const pricing = await getEffectiveModelPricing({
      provider: 'openai',
      model: 'test-model',
      at: new Date('2026-01-01T00:00:00.000Z'),
      trx,
    });
    if (!pricing) throw new Error('missing pricing');

    // input: 1500 tokens @ $0.10/1M => $0.00015 => 150 micros
    // output: 2500 tokens @ $0.20/1M => $0.0005 => 500 micros
    const cost = estimateCostUsdMicros({
      pricing,
      inputTokens: 1500,
      outputTokens: 2500,
    });

    expect(cost.inputCostUsdMicros).toBe(150);
    expect(cost.outputCostUsdMicros).toBe(500);
    expect(cost.totalCostUsdMicros).toBe(650);
  });
});
