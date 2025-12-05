// import type { Knex } from 'knex';
// import { knexClient } from '../../../db/knexClient.js';
// import type { Prediction } from '../post-prediction/predictions/predictions.types.js';
// import { logger } from '../../../shared/index.js';

// const PREDICTIONS_TABLE = 'categorization_predictions';

// export interface CandidateSelectionOptions {
//   taskId: string;
//   rulesAlwaysWin?: boolean; // Default: true
//   confidenceThreshold?: number; // Minimum confidence (default: 0.0)
//   trx?: Knex.Transaction;
// }

// /**
//  * Select the primary prediction for a task
//  * This determines which prediction should become a candidate
//  *
//  * Selection rules:
//  * 1. Rules always win over ML (if rulesAlwaysWin is true, which is default)
//  * 2. Only valid predictions (status='pending') are considered
//  * 3. Latest prediction per source is used (by run_timestamp)
//  * 4. ML predictions are ordered by confidence (highest first)
//  */
// export async function selectPrimaryPrediction(
//   opts: CandidateSelectionOptions,
// ): Promise<Prediction | null> {
//   const knex = opts.trx ?? knexClient;
//   const rulesAlwaysWin = opts.rulesAlwaysWin ?? true;
//   const confidenceThreshold = opts.confidenceThreshold ?? 0.0;

//   try {
//     // Fetch latest predictions per source
//     const predictions = await fetchLatestPredictions(opts.taskId, knex);

//     if (predictions.length === 0) {
//       return null;
//     }

//     // Filter valid predictions (status='pending' or no status field)
//     const valid = predictions.filter(
//       (p) => !p.status || p.status === 'pending',
//     );

//     if (valid.length === 0) {
//       logger.debug(
//         { taskId: opts.taskId, predictionCount: predictions.length },
//         'No valid predictions found for task',
//       );
//       return null;
//     }

//     // Apply confidence threshold
//     const qualified = valid.filter((p) => p.confidence >= confidenceThreshold);

//     if (qualified.length === 0) {
//       logger.debug(
//         {
//           taskId: opts.taskId,
//           confidenceThreshold,
//           validCount: valid.length,
//         },
//         'No predictions meet confidence threshold',
//       );
//       return null;
//     }

//     // Sort by priority
//     const sorted = qualified.sort((a, b) => {
//       // Rules always win (if enabled)
//       if (rulesAlwaysWin) {
//         if (a.source === 'rule' && b.source !== 'rule') return -1;
//         if (b.source === 'rule' && a.source !== 'rule') return 1;
//       }

//       // Otherwise by confidence
//       return b.confidence - a.confidence;
//     });

//     const selected = sorted[0];
//     logger.debug(
//       {
//         taskId: opts.taskId,
//         selectedPredictionId: selected.id,
//         source: selected.source,
//         confidence: selected.confidence,
//       },
//       'Selected primary prediction',
//     );

//     return selected;
//   } catch (error) {
//     logger.error(
//       { error, taskId: opts.taskId },
//       'Failed to select primary prediction',
//     );
//     throw error;
//   }
// }

// /**
//  * Fetch latest predictions per source for a task
//  * Uses DISTINCT ON to get the most recent prediction per source
//  */
// async function fetchLatestPredictions(
//   taskId: string,
//   knex: Knex | Knex.Transaction,
// ): Promise<Prediction[]> {
//   // PostgreSQL DISTINCT ON to get latest per source
//   const result = await knex.raw<{ rows: Prediction[] }>(
//     `
//     SELECT DISTINCT ON (source)
//       *
//     FROM ${PREDICTIONS_TABLE}
//     WHERE categorization_task_id = ?
//       AND is_deleted = false
//     ORDER BY source, created_at DESC
//   `,
//     [taskId],
//   );

//   return result.rows;
// }
