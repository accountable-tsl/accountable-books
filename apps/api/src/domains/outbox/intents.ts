export const OUTBOX_INTENT = {
  WORK_MATERIALIZATION_REQUESTED: 'work_materialization_requested',
  ACTIVITY_EVENT_REQUESTED: 'activity_event_requested',
  NOTIFICATION_REQUESTED: 'notification_requested',
  NOTIFICATION_ATTENTION_RESOLVED: 'notification_attention_resolved',
  NOTIFICATION_COMMS_REQUESTED: 'notification_comms_requested',
  GL_BALANCE_RECALC_REQUESTED: 'gl_balance_recalc_requested',
  CLOSE_SIGNAL_EVAL_REQUESTED: 'close_signal_eval_requested',
  BANK_SYNC_REQUESTED: 'bank_sync_requested',
} as const;

export type OutboxIntentType =
  (typeof OUTBOX_INTENT)[keyof typeof OUTBOX_INTENT];

export interface OutboxClaimFilter {
  intentType?: OutboxIntentType;
  scopeKey?: string;
  /** Claim only these intent types (heavy lane). */
  intentTypes?: OutboxIntentType[];
  /** Claim everything except these intent types (fast lane). */
  excludeIntentTypes?: OutboxIntentType[];
}
