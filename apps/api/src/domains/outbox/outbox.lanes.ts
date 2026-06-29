import { OUTBOX_INTENT } from './intents.js';

import type { OutboxClaimFilter, OutboxIntentType } from './intents.js';

export const OUTBOX_LANE = {
  FAST: 'fast',
  HEAVY: 'heavy',
} as const;
export type OutboxLane = (typeof OUTBOX_LANE)[keyof typeof OUTBOX_LANE];

/**
 * Heavy, slow intents get their own runner so a long balance recalc never holds
 * up quick work like notifications. Everything else is "fast" by default, so a
 * newly added intent type is automatically served by the fast lane.
 */
export const HEAVY_LANE_INTENTS: OutboxIntentType[] = [
  OUTBOX_INTENT.GL_BALANCE_RECALC_REQUESTED,
  OUTBOX_INTENT.CLOSE_SIGNAL_EVAL_REQUESTED,
];

export function laneFilter(lane: OutboxLane): OutboxClaimFilter {
  return lane === OUTBOX_LANE.HEAVY
    ? { intentTypes: HEAVY_LANE_INTENTS }
    : { excludeIntentTypes: HEAVY_LANE_INTENTS };
}
