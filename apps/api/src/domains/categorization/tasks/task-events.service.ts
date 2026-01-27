import type { Knex } from 'knex';

import { knexClient } from '../../../db/knexClient.js';
import { logger } from '../../../shared/index.js';
import { newTaskEvent } from './task-events.types.js';

import type { NewTaskEvent, TaskEvent } from './task-events.types.js';

const TASK_EVENTS_TABLE = 'categorization_task_events';

/**
 * Log a task event
 */
export async function logTaskEvent(
  params: NewTaskEvent,
  knex: Knex = knexClient,
): Promise<string> {
  try {
    const eventData = {
      categorization_task_id: params.categorization_task_id,
      run_id: params.run_id,
      event_stage: params.event_stage,
      event_type: params.event_type,
      event_timestamp: params.event_timestamp ?? new Date(),
      comment: params.comment ?? null,
      metadata: params.metadata ?? null,
    };

    // Validate
    const validated = newTaskEvent.parse(eventData);

    const [event] = await knex(TASK_EVENTS_TABLE)
      .insert({
        categorization_task_id: validated.categorization_task_id,
        run_id: validated.run_id,
        event_stage: validated.event_stage,
        event_type: validated.event_type,
        event_timestamp: validated.event_timestamp,
        comment: validated.comment,
        metadata: validated.metadata,
      })
      .returning(['id']);

    return event.id;
  } catch (error) {
    logger.error({ error, params }, 'Failed to log categorization task event');
    throw error;
  }
}

/**
 * Log a task event (non-blocking - doesn't throw)
 */
export async function logTaskEventSafe(
  params: NewTaskEvent & { trx?: Knex.Transaction },
): Promise<void> {
  try {
    await logTaskEvent(params, params.trx);
  } catch (error) {
    // Log but don't throw - event logging shouldn't break the main flow
    logger.error({ error, params }, 'Failed to log task event (non-blocking)');
  }
}

/**
 * Get all events for a task
 */
export async function getEventsByTask(
  categorizationTaskId: string,
  knex: Knex = knexClient,
): Promise<TaskEvent[]> {
  const events = await knex(TASK_EVENTS_TABLE)
    .where({
      categorization_task_id: categorizationTaskId,
      is_deleted: false,
    })
    .orderBy('event_timestamp', 'asc')
    .select('*');

  return events;
}

/**
 * Get events by run ID
 */
export async function getEventsByRun(
  runId: string,
  knex: Knex = knexClient,
): Promise<TaskEvent[]> {
  const events = await knex(TASK_EVENTS_TABLE)
    .where({ run_id: runId, is_deleted: false })
    .orderBy('event_timestamp', 'asc')
    .select('*');

  return events;
}

/**
 * Get latest event for a task
 */
export async function getLatestEvent(
  categorizationTaskId: string,
  knex: Knex = knexClient,
): Promise<TaskEvent | null> {
  const event = await knex(TASK_EVENTS_TABLE)
    .where({
      categorization_task_id: categorizationTaskId,
      is_deleted: false,
    })
    .orderBy('event_timestamp', 'desc')
    .first();

  return event || null;
}
