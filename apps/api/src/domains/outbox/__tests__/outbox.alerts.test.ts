import { beforeEach, describe, expect, it, vi } from 'vitest';

import { alertAdmins } from '../../../features/comms/index.js';
import {
  alertOutboxDeadLetter,
  maybeAlertOutboxHealth,
} from '../outbox.alerts.js';

import type { OutboxRow } from '../outbox.model.js';

vi.mock('../../../features/comms/index.js', () => ({
  alertAdmins: vi.fn(),
}));

const alertAdminsMock = vi.mocked(alertAdmins);

function makeRow(overrides: Partial<OutboxRow> = {}): OutboxRow {
  return {
    id: 'row-1',
    intent_type: 'gl_balance_recalc_requested',
    scope_key: 'scope-1',
    payload: {},
    status: 'failed',
    available_at: new Date(),
    completed_at: new Date(),
    dispatch_attempt_count: 10,
    last_error: 'boom',
    failed_at: new Date(),
    ...overrides,
  };
}

describe('outbox alerts', () => {
  beforeEach(() => {
    alertAdminsMock.mockReset();
    alertAdminsMock.mockResolvedValue({ accepted: true, deliveries: [] });
  });

  it('alerts once per dead-lettered row, keyed by row id', async () => {
    await alertOutboxDeadLetter(makeRow({ id: 'abc' }), new Error('kaboom'));

    expect(alertAdminsMock).toHaveBeenCalledTimes(1);
    expect(alertAdminsMock.mock.calls[0][0]).toMatchObject({
      idempotencyKey: 'outbox-deadletter:abc',
      eventType: 'outbox.intent_dead_lettered',
    });
  });

  it('never throws when the alert send fails', async () => {
    alertAdminsMock.mockRejectedValue(new Error('comms down'));

    await expect(
      alertOutboxDeadLetter(makeRow(), new Error('x')),
    ).resolves.toBeUndefined();
  });

  it('alerts on a failed backlog', async () => {
    await maybeAlertOutboxHealth({
      failedCount: 3,
      pendingCount: 0,
      oldestPendingAgeSeconds: null,
    });

    expect(alertAdminsMock).toHaveBeenCalledTimes(1);
    expect(alertAdminsMock.mock.calls[0][0].eventType).toBe(
      'outbox.health_failed_backlog',
    );
  });

  it('alerts when the runner looks stalled', async () => {
    await maybeAlertOutboxHealth({
      failedCount: 0,
      pendingCount: 5,
      oldestPendingAgeSeconds: 3600,
    });

    expect(alertAdminsMock).toHaveBeenCalledTimes(1);
    expect(alertAdminsMock.mock.calls[0][0].eventType).toBe(
      'outbox.health_drain_stalled',
    );
  });

  it('stays quiet when healthy', async () => {
    await maybeAlertOutboxHealth({
      failedCount: 0,
      pendingCount: 2,
      oldestPendingAgeSeconds: 30,
    });

    expect(alertAdminsMock).not.toHaveBeenCalled();
  });
});
