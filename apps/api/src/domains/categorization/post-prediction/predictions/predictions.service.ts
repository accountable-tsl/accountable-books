import type { Knex } from 'knex';
import z from 'zod';

import { knexClient } from '../../../../db/knexClient.js';
import { logger } from '../../../../shared/index.js';
import { logTaskEventSafe } from '../../tasks/task-events.service.js';
import {
  type PersistPredictionParams,
  persistPredictionParams,
  type UpdatePredictionParams,
  updatePredictionParams,
} from './predictions.types.js';

// Persist predictions to the database

const PREDICTIONS_TABLE = 'categorization_predictions';
const PREDICTION_LINES_TABLE = 'categorization_prediction_lines';

/**
 *
 */

/**
 * Inserts a prediction and its associated lines into the database.
 *
 * @param {PersistPredictionParams} params - The parameters for persisting the prediction.
 * @param {Knex.Transaction} [trx] - An optional transaction object for database operations.
 * @returns {Promise<string>} - A promise that resolves to the ID of the inserted prediction.
 * @throws {Error} - If the inputs are invalid.
 */
export async function persistPrediction(
  params: PersistPredictionParams,
  trx?: Knex.Transaction,
): Promise<string> {
  // Validate inputs
  const validationResult = persistPredictionParams.safeParse(params);
  if (!validationResult.success) {
    logger.error({
      message: 'Attempted to persist prediction with invalid inputs',
      errors: z.flattenError(validationResult.error),
    });
    throw new Error('Invalid inputs (@persistPrediction)');
  }

  const { prediction: predictionHead, predictionLines } = validationResult.data;

  const exec = async (trx: Knex.Transaction) => {
    const [prediction] = await trx(PREDICTIONS_TABLE)
      .insert(predictionHead)
      .returning(['id']);

    const predictionId = prediction.id;

    // Insert prediction lines with the returned prediction ID
    const linesToInsert = predictionLines.map((line) => ({
      ...line,
      prediction_id: predictionId,
      contact_id: line.contact_id ?? predictionHead.contact_id ?? null,
      contact_type: line.contact_type ?? predictionHead.contact_type ?? null,
    }));
    await trx(PREDICTION_LINES_TABLE).insert(linesToInsert);

    // Log prediction created event
    // Event stage depends on source - determined by caller context
    // This is a workflow-level event that occurs after rule/ml processing
    await logTaskEventSafe({
      categorization_task_id: predictionHead.categorization_task_id,
      run_id: predictionHead.run_id,
      event_stage: 'workflow',
      event_type: 'prediction_created',
      event_timestamp: new Date(),
      metadata: {
        prediction_id: predictionId,
        source: predictionHead.source,
        prediction_lines_count: predictionLines.length,
        confidence: predictionHead.confidence,
      },
      trx,
    });

    return predictionId;
  };

  if (trx) {
    return await exec(trx);
  } else {
    return await knexClient.transaction(exec);
  }
}

// Update prediction (e.g update prediction status)
export async function updatePrediction(
  params: UpdatePredictionParams,
): Promise<void> {
  // Validate inputs
  const validationResult = updatePredictionParams.safeParse(params);
  if (!validationResult.success) {
    logger.error({
      message: 'Attempted to update prediction with invalid inputs',
      errors: z.flattenError(validationResult.error),
    });
    throw new Error('Invalid inputs (@updatePrediction)');
  }

  const { predictionId, status, statusReason, metadata, metadataAction } =
    validationResult.data;

  const exec = async (tx: Knex.Transaction) => {
    let newMetadata: Record<string, unknown> | null = null;

    if (metadata) {
      if (metadataAction === 'update') {
        const row = await tx(PREDICTIONS_TABLE)
          .where({ id: predictionId })
          .select('metadata')
          .first();

        const oldMeta = (row?.metadata ?? {}) as Record<string, unknown>;
        const changes: Array<Record<string, unknown>> =
          (oldMeta.changes as Array<Record<string, unknown>>) ?? [];

        const patch = metadata ?? {};
        const auditEntries: Array<Record<string, unknown>> = [];

        for (const [key, newVal] of Object.entries(patch)) {
          const oldVal = oldMeta[key];
          if (!(key in oldMeta)) {
            auditEntries.push({
              updated_at: new Date().toISOString(),
              action: `added "${key}"`,
              value: newVal,
            });
          } else if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
            auditEntries.push({
              updated_at: new Date().toISOString(),
              action: `changed "${key}"`,
              from: oldVal,
              to: newVal,
            });
          }
        }

        newMetadata = {
          ...oldMeta,
          ...patch,
          changes: [...changes, ...auditEntries],
        };
      } else if (metadataAction === 'replace') {
        newMetadata = {
          ...metadata,
          changes: [], // start fresh
        };
      }
    }

    const updatePayload: Record<string, unknown> = {
      ...(status && { status }),
      ...(statusReason && { status_reason: statusReason }),
      ...(newMetadata && { metadata: newMetadata }),
      updated_at: tx.fn.now(),
    };

    await tx(PREDICTIONS_TABLE)
      .where({ id: predictionId })
      .update(updatePayload);
  };

  await knexClient.transaction(exec);
}
