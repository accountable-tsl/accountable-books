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
 * Draft type for prediction lines (before persistence)
 * Used as intermediate format between candidate lines and database format
 */
// export interface PredictionLineDraft {
//   entryType: DebitCredit;
//   coaId: string;
//   projectId?: string | null;
//   amountNative: number;
//   currencyCode: string;
//   description?: string | null;
//   isBankLeg?: boolean;
//   explanation?: string | null;
//   metadata?: Record<string, unknown> | null;
// }

// export interface PredictionLineDraft {
//   entryType: DebitCredit;
//   coaId: string;
//   projectId?: string | null;
//   amountNative: number;
//   currencyCode: string;
//   description?: string | null;
//   isBankLeg?: boolean;
//   explanation?: string | null;
//   metadata?: Record<string, unknown> | null;
// }

// export interface CreatePredictionParams {
//   categorizationTaskId: string;
//   bankTransactionId: string;
//   bankTransactionDate: string;
//   runId: string;
//   contactId?: string | null;
//   contactType?: string | null;
//   companyId: string;
//   source: TxnCategorizationSource;
//   confidence: number;
//   modelVersion?: string | null;
//   predictionId?: string; // Optional: use provided ID (e.g., from ML engine) instead of generating one
//   status: PredictionStatus;
//   statusReason?: string | null;
//   inputChecksum?: string | null;
//   explanation?: string | null;
//   metadata?: Record<string, unknown> | null;
//   lines: PredictionLineDraft[];
// }

// export class PredictionRepository {
//   constructor(private readonly knex: Knex = knexClient) {}

//   async softDeleteByTask(params: {
//     categorizationTaskId: string;
//     source?: TxnCategorizationSource;
//   }): Promise<number> {
//     const query = this.knex(PREDICTIONS_TABLE)
//       .where({
//         categorization_task_id: params.categorizationTaskId,
//         is_deleted: false,
//       })
//       .update({
//         is_deleted: true,
//         updated_at: this.knex.fn.now(),
//       });
//     if (params.source) {
//       query.andWhere('source', params.source);
//     }
//     return await query;
//   }

//   async createPredictionWithLines(
//     params: CreatePredictionParams,
//   ): Promise<string> {
//     return await this.knex.transaction(async (trx) => {
//       const insertData: Record<string, unknown> = {
//         categorization_task_id: params.categorizationTaskId,
//         bank_transaction_id: params.bankTransactionId,
//         bank_transaction_date: params.bankTransactionDate,
//         run_id: params.runId,
//         contact_id: params.contactId ?? null,
//         contact_type: params.contactType ?? null,
//         company_id: params.companyId,
//         source: params.source,
//         confidence: params.confidence,
//         model_version: params.modelVersion ?? null,
//         status: params.status,
//         status_reason: params.statusReason ?? null,
//         input_checksum: params.inputChecksum ?? null,
//         explanation: params.explanation ?? null,
//         metadata: params.metadata ?? null,
//       };

//       // Use provided ID if available (e.g., from ML engine), otherwise let database generate it
//       if (params.predictionId) {
//         insertData.id = params.predictionId;
//       }

//       const [prediction] = await trx(PREDICTIONS_TABLE)
//         .insert(insertData)
//         .returning(['id']);

//       if (params.lines.length) {
//         const rows = params.lines.map((line) => ({
//           prediction_id: prediction.id,
//           entry_type: line.entryType,
//           coa_id: line.coaId,
//           project_id: line.projectId ?? null,
//           amount_native: line.amountNative,
//           currency_code: line.currencyCode,
//           description: line.description ?? null,
//           is_bank_leg: line.isBankLeg ?? false,
//           explanation: line.explanation ?? null,
//           metadata: line.metadata ?? null,
//         }));
//         await trx(PREDICTION_LINES_TABLE).insert(rows);
//       }

//       return prediction.id;
//     });
//   }
// }

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
