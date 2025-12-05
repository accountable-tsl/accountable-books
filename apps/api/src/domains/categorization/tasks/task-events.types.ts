import z from 'zod';

import { dbBaseFields } from '../../../core/index.js';
import {
  type TxnCategorizationSource,
  txnCategorizationSource,
} from '../categorization.types.js';

export const taskEventType = z.enum([
  'categorization_task_created',
  'rules_started',
  'rules_applied',
  'rules_no_match',
  'rules_conflict',
  'rules_error',
  'rules_failed',
  'ml_enqueued',
  'ml_started',
  'ml_completed',
  'ml_failed',
  'prediction_created',
  'constraint_validation_failed',
  'candidate_created',
  'candidate_ignored',
  'candidate_replaced',
]);
export type TaskEventType = z.infer<typeof taskEventType>;

export const newTaskEvent = z.object({
  categorization_task_id: z.uuid(),
  run_id: z.uuid(),
  source: txnCategorizationSource,
  event_type: taskEventType,
  event_timestamp: z.date(),
  metadata: z.record(z.string(), z.any()).nullish(),
});
export type NewTaskEvent = z.infer<typeof newTaskEvent>;

export const taskEvent = z.object({
  ...newTaskEvent.shape,
  ...dbBaseFields.shape,
});
export type TaskEvent = z.infer<typeof taskEvent>;
