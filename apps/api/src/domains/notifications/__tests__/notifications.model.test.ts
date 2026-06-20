import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createTestTransaction } from '../../../../config/test-db.js';
import {
  getTestCompanyId,
  getTestUserId,
  US_USER_EMAIL,
} from '../../../../test/helpers.js';
import { OUTBOX_INTENT } from '../../work/work.types.js';
import {
  resolveNotificationPreference,
  setNotificationPreference,
} from '../notification-preferences.js';
import {
  getNotificationFeed,
  getUnreadCounter,
  markAllNotificationsRead,
  markNotificationsRead,
  markNotificationsViewed,
  notify,
} from '../notifications.model.js';
import {
  NOTIFICATION_CHANNEL,
  NOTIFICATION_TYPE,
} from '../notifications.types.js';

import type { NotifyEvent } from '../notifications.types.js';

describe('notifications model', () => {
  let trx: Knex.Transaction;
  let userId: string;
  let companyId: string;

  beforeEach(async () => {
    trx = await createTestTransaction();
    userId = await getTestUserId(trx, US_USER_EMAIL);
    companyId = await getTestCompanyId(trx, 'bizDemoUS');
  });

  afterEach(async () => {
    await trx.rollback();
  });

  function makeEvent(overrides: Partial<NotifyEvent> = {}): NotifyEvent {
    const unique = randomUUID();
    return {
      recipientUserId: userId,
      clientCompanyId: companyId,
      eventType: NOTIFICATION_TYPE.WORK_ASSIGNED,
      priority: 'normal',
      title: `Assigned work ${unique}`,
      body: 'A work item needs attention.',
      destination: { workspace: 'work_queue' },
      sourceEntity: { type: 'test_source', key: `test:${unique}` },
      idempotencyKey: `notification-test:${unique}`,
      occurredAt: '2026-06-19T10:00:00.000Z',
      data: { fixture: unique },
      ...overrides,
    };
  }

  async function commsIntentsFor(event: NotifyEvent) {
    const fixture = event.data?.fixture;

    return trx('app.outbox_intents')
      .where({
        intent_type: OUTBOX_INTENT.NOTIFICATION_COMMS_REQUESTED,
      })
      .andWhereRaw(`payload->'payload'->'data'->>'fixture' = ?`, [
        String(fixture),
      ]);
  }

  it('deduplicates notify events and counts unread once', async () => {
    const idempotencyKey = `notification-test:${randomUUID()}`;
    const event = makeEvent({
      idempotencyKey,
      sourceEntity: { type: 'test_source', key: idempotencyKey },
    });

    const first = await notify(event, { trx });
    const duplicate = await notify(event, { trx });

    expect(first.inserted).toBe(true);
    expect(first.notification?.id).toBeTruthy();
    expect(first.commsRequested).toBe(1);
    expect(duplicate.inserted).toBe(false);
    expect(duplicate.notification?.id).toBe(first.notification?.id);
    expect(duplicate.commsRequested).toBe(0);

    const rows = await trx('app.notifications').where({
      recipient_user_id: userId,
      idempotency_key: idempotencyKey,
    });
    expect(rows).toHaveLength(1);

    await expect(
      getUnreadCounter({ userId, companyId, trx }),
    ).resolves.toMatchObject({ unreadCount: 1 });
  });

  it('marks auto-read notifications read on view but keeps explicit items unread', async () => {
    const normal = await notify(makeEvent(), { trx });
    const high = await notify(
      makeEvent({
        eventType: NOTIFICATION_TYPE.WORK_OVERDUE,
        priority: 'high',
        idempotencyKey: `notification-test:${randomUUID()}`,
      }),
      { trx },
    );

    const result = await markNotificationsViewed({
      recipientUserId: userId,
      notificationIds: [normal.notification!.id, high.notification!.id],
      companyId,
      trx,
    });

    expect(result).toEqual({ seenCount: 2, readCount: 1 });
    await expect(
      getUnreadCounter({ userId, companyId, trx }),
    ).resolves.toMatchObject({ unreadCount: 1 });

    const rows = await trx('app.notifications')
      .whereIn('id', [normal.notification!.id, high.notification!.id])
      .select('id', 'seen_at', 'read_at');

    const normalRow = rows.find((row) => row.id === normal.notification!.id);
    const highRow = rows.find((row) => row.id === high.notification!.id);
    expect(normalRow?.seen_at).toBeTruthy();
    expect(normalRow?.read_at).toBeTruthy();
    expect(highRow?.seen_at).toBeTruthy();
    expect(highRow?.read_at).toBeNull();
  });

  it('does not double-decrement unread when the same notification is marked read twice', async () => {
    const created = await notify(makeEvent({ priority: 'high' }), { trx });

    const first = await markNotificationsRead({
      recipientUserId: userId,
      notificationIds: [created.notification!.id],
      companyId,
      trx,
    });
    const second = await markNotificationsRead({
      recipientUserId: userId,
      notificationIds: [created.notification!.id],
      companyId,
      trx,
    });

    expect(first).toEqual({ readCount: 1 });
    expect(second).toEqual({ readCount: 0 });
    await expect(
      getUnreadCounter({ userId, companyId, trx }),
    ).resolves.toMatchObject({ unreadCount: 0 });
  });

  it('counts unread notifications from the current company plus global rows', async () => {
    const otherCompanyId = await getTestCompanyId(trx, 'bizDemoNG');
    const currentCompany = await notify(
      makeEvent({
        deliveryPolicy: {
          mode: 'only',
          channels: [NOTIFICATION_CHANNEL.IN_APP],
        },
      }),
      { trx },
    );
    const global = await notify(
      makeEvent({
        eventType: NOTIFICATION_TYPE.USER_PROFILE_PICTURE_UPDATE_FAILED,
        clientCompanyId: null,
        firmCompanyId: null,
        title: 'Profile picture update failed',
        body: 'Upload a new image to finish updating your profile.',
        sourceEntity: { type: 'user_profile', id: userId },
        deliveryPolicy: {
          mode: 'only',
          channels: [NOTIFICATION_CHANNEL.IN_APP],
        },
      }),
      { trx },
    );
    const otherCompany = await notify(
      makeEvent({
        clientCompanyId: otherCompanyId,
        deliveryPolicy: {
          mode: 'only',
          channels: [NOTIFICATION_CHANNEL.IN_APP],
        },
      }),
      { trx },
    );

    await expect(
      getUnreadCounter({ userId, companyId, trx }),
    ).resolves.toMatchObject({ unreadCount: 2 });

    const feed = await getNotificationFeed({
      recipientUserId: userId,
      companyId,
      trx,
    });

    const feedIds = feed.items.map((item) => item.id);
    expect(feedIds).toContain(currentCompany.notification!.id);
    expect(feedIds).toContain(global.notification!.id);
    expect(feedIds).not.toContain(otherCompany.notification!.id);
  });

  it('uses a stable created-at/id cursor when feed rows share a timestamp', async () => {
    const createdIds: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      const result = await notify(
        makeEvent({
          title: `Cursor fixture ${index}`,
          deliveryPolicy: {
            mode: 'only',
            channels: [NOTIFICATION_CHANNEL.IN_APP],
          },
        }),
        { trx },
      );
      createdIds.push(result.notification!.id);
    }

    const sharedCreatedAt = '2026-06-19T12:00:00.123456Z';
    await trx('app.notifications').whereIn('id', createdIds).update({
      created_at: trx.raw('?::timestamptz', [sharedCreatedAt]),
      updated_at: trx.raw('?::timestamptz', [sharedCreatedAt]),
    });

    const orderedRows = await trx('app.notifications')
      .whereIn('id', createdIds)
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .select('id');
    const orderedIds = orderedRows.map((row) => row.id as string);

    const firstPage = await getNotificationFeed({
      recipientUserId: userId,
      companyId,
      limit: 2,
      trx,
    });
    expect(firstPage.items.map((item) => item.id)).toEqual(
      orderedIds.slice(0, 2),
    );
    expect(firstPage.nextCursor).toBeTruthy();
    if (!firstPage.nextCursor) {
      throw new Error('Expected first notification feed page to have a cursor');
    }

    const secondPage = await getNotificationFeed({
      recipientUserId: userId,
      companyId,
      limit: 2,
      before: firstPage.nextCursor,
      trx,
    });

    expect(secondPage.items.map((item) => item.id)).toEqual(
      orderedIds.slice(2),
    );
    expect(secondPage.nextCursor).toBeNull();
    expect(
      new Set([
        ...firstPage.items.map((item) => item.id),
        ...secondPage.items.map((item) => item.id),
      ]),
    ).toEqual(new Set(orderedIds));
  });

  it('does not view or read notifications scoped to another company', async () => {
    const otherCompanyId = await getTestCompanyId(trx, 'bizDemoNG');
    const currentAutoRead = await notify(
      makeEvent({
        deliveryPolicy: {
          mode: 'only',
          channels: [NOTIFICATION_CHANNEL.IN_APP],
        },
      }),
      { trx },
    );
    const otherAutoRead = await notify(
      makeEvent({
        clientCompanyId: otherCompanyId,
        deliveryPolicy: {
          mode: 'only',
          channels: [NOTIFICATION_CHANNEL.IN_APP],
        },
      }),
      { trx },
    );
    const currentExplicitRead = await notify(
      makeEvent({
        priority: 'high',
        deliveryPolicy: {
          mode: 'only',
          channels: [NOTIFICATION_CHANNEL.IN_APP],
        },
      }),
      { trx },
    );
    const otherExplicitRead = await notify(
      makeEvent({
        clientCompanyId: otherCompanyId,
        priority: 'high',
        deliveryPolicy: {
          mode: 'only',
          channels: [NOTIFICATION_CHANNEL.IN_APP],
        },
      }),
      { trx },
    );

    await expect(
      markNotificationsViewed({
        recipientUserId: userId,
        notificationIds: [
          currentAutoRead.notification!.id,
          otherAutoRead.notification!.id,
        ],
        companyId,
        trx,
      }),
    ).resolves.toEqual({ seenCount: 1, readCount: 1 });

    await expect(
      markNotificationsRead({
        recipientUserId: userId,
        notificationIds: [
          currentExplicitRead.notification!.id,
          otherExplicitRead.notification!.id,
        ],
        companyId,
        trx,
      }),
    ).resolves.toEqual({ readCount: 1 });

    const rows = await trx('app.notifications')
      .whereIn('id', [
        currentAutoRead.notification!.id,
        otherAutoRead.notification!.id,
        currentExplicitRead.notification!.id,
        otherExplicitRead.notification!.id,
      ])
      .select('id', 'seen_at', 'read_at');
    const byId = new Map(rows.map((row) => [row.id, row]));

    expect(byId.get(currentAutoRead.notification!.id)?.seen_at).toBeTruthy();
    expect(byId.get(currentAutoRead.notification!.id)?.read_at).toBeTruthy();
    expect(byId.get(otherAutoRead.notification!.id)?.seen_at).toBeNull();
    expect(byId.get(otherAutoRead.notification!.id)?.read_at).toBeNull();
    expect(
      byId.get(currentExplicitRead.notification!.id)?.read_at,
    ).toBeTruthy();
    expect(byId.get(otherExplicitRead.notification!.id)?.read_at).toBeNull();
  });

  it('mark-all read decrements by the actual changed rows', async () => {
    const first = await notify(makeEvent({ priority: 'high' }), { trx });
    await notify(
      makeEvent({
        priority: 'high',
        idempotencyKey: `notification-test:${randomUUID()}`,
      }),
      { trx },
    );
    await notify(
      makeEvent({
        priority: 'high',
        idempotencyKey: `notification-test:${randomUUID()}`,
      }),
      { trx },
    );

    await markNotificationsRead({
      recipientUserId: userId,
      notificationIds: [first.notification!.id],
      companyId,
      trx,
    });

    await expect(
      getUnreadCounter({ userId, companyId, trx }),
    ).resolves.toMatchObject({ unreadCount: 2 });

    const result = await markAllNotificationsRead({
      recipientUserId: userId,
      companyId,
      trx,
    });

    expect(result).toEqual({ readCount: 2 });
    await expect(
      getUnreadCounter({ userId, companyId, trx }),
    ).resolves.toMatchObject({ unreadCount: 0 });
  });

  it('uses live code defaults when no preference row exists', async () => {
    await expect(
      resolveNotificationPreference({
        userId,
        notificationType: NOTIFICATION_TYPE.WORK_ASSIGNED,
        channel: NOTIFICATION_CHANNEL.EMAIL,
        trx,
      }),
    ).resolves.toMatchObject({
      deliveryMode: 'immediate',
      source: 'default',
    });

    await expect(
      resolveNotificationPreference({
        userId,
        notificationType: 'unknown.type',
        channel: NOTIFICATION_CHANNEL.EMAIL,
        trx,
      }),
    ).resolves.toMatchObject({
      deliveryMode: 'off',
      source: 'default',
    });
  });

  it('rejects unknown notification event types', async () => {
    await expect(
      notify(
        {
          ...makeEvent(),
          eventType: 'unknown.type',
        } as unknown as NotifyEvent,
        { trx },
      ),
    ).rejects.toThrow();
  });

  it('requires company context for company-scoped notification events', async () => {
    await expect(
      notify(
        makeEvent({
          clientCompanyId: null,
          firmCompanyId: null,
        }),
        { trx },
      ),
    ).rejects.toThrow(
      `Notification event ${NOTIFICATION_TYPE.WORK_ASSIGNED} is company-scoped and requires firmCompanyId or clientCompanyId`,
    );
  });

  it('allows explicitly global user/account notifications without company context', async () => {
    const event = makeEvent({
      eventType: NOTIFICATION_TYPE.USER_PROFILE_PICTURE_UPDATE_FAILED,
      clientCompanyId: null,
      firmCompanyId: null,
      title: 'Profile picture update failed',
      body: 'Upload a new image to finish updating your profile.',
      sourceEntity: { type: 'user_profile', id: userId },
      deliveryPolicy: {
        mode: 'only',
        channels: [NOTIFICATION_CHANNEL.IN_APP],
      },
    });

    const result = await notify(event, { trx });

    expect(result.inserted).toBe(true);
    expect(result.notification).toMatchObject({
      eventType: NOTIFICATION_TYPE.USER_PROFILE_PICTURE_UPDATE_FAILED,
      firmCompanyId: null,
      clientCompanyId: null,
    });

    const feed = await getNotificationFeed({
      recipientUserId: userId,
      companyId,
      trx,
    });
    expect(feed.items.map((item) => item.id)).toContain(
      result.notification!.id,
    );
  });

  it('rejects fake company context on explicitly global notifications', async () => {
    await expect(
      notify(
        makeEvent({
          eventType: NOTIFICATION_TYPE.USER_PROFILE_PICTURE_UPDATE_FAILED,
          sourceEntity: { type: 'user_profile', id: userId },
          deliveryPolicy: {
            mode: 'only',
            channels: [NOTIFICATION_CHANNEL.IN_APP],
          },
        }),
        { trx },
      ),
    ).rejects.toThrow(
      `Notification event ${NOTIFICATION_TYPE.USER_PROFILE_PICTURE_UPDATE_FAILED} is global and must not include firmCompanyId or clientCompanyId`,
    );
  });

  it('validates event data against the event registry schema', async () => {
    await expect(
      notify(
        makeEvent({
          data: {
            activeSubjectCount: 'many',
          },
        }),
        { trx },
      ),
    ).rejects.toThrow();
  });

  it('routes email even when in-app is suppressed by preference', async () => {
    await setNotificationPreference({
      userId,
      notificationType: NOTIFICATION_TYPE.WORK_ASSIGNED,
      channel: NOTIFICATION_CHANNEL.IN_APP,
      deliveryMode: 'off',
      trx,
    });

    const event = makeEvent();
    const emailOnlyResult = await notify(event, { trx });
    expect(emailOnlyResult).toMatchObject({
      notification: null,
      inserted: false,
      suppressed: false,
      commsRequested: 1,
    });
    await expect(commsIntentsFor(event)).resolves.toHaveLength(1);

    const critical = await notify(makeEvent({ priority: 'critical' }), { trx });
    expect(critical.inserted).toBe(true);
    expect(critical.suppressed).toBe(false);
  });

  it('keeps external delivery off by default for account notifications', async () => {
    const event = makeEvent({
      eventType: NOTIFICATION_TYPE.USER_PROFILE_PICTURE_UPDATE_FAILED,
      clientCompanyId: null,
      firmCompanyId: null,
      title: 'Profile picture update failed',
      body: 'Upload a new image to finish updating your profile.',
      sourceEntity: { type: 'user_profile', id: userId },
    });

    const result = await notify(event, { trx });

    expect(result.inserted).toBe(true);
    expect(result.commsRequested).toBe(0);
    await expect(commsIntentsFor(event)).resolves.toHaveLength(0);
  });

  it('maps explicit external delivery to the registered email route', async () => {
    const event = makeEvent({
      eventType: NOTIFICATION_TYPE.USER_PROFILE_PICTURE_UPDATE_FAILED,
      clientCompanyId: null,
      firmCompanyId: null,
      title: 'Profile picture update failed',
      body: 'Upload a new image to finish updating your profile.',
      sourceEntity: { type: 'user_profile', id: userId },
      deliveryPolicy: {
        mode: 'only',
        channels: [NOTIFICATION_CHANNEL.EMAIL],
      },
    });

    const result = await notify(event, { trx });

    expect(result).toMatchObject({
      notification: null,
      inserted: false,
      suppressed: false,
      commsRequested: 1,
    });

    const [intent] = await commsIntentsFor(event);
    expect(intent).toBeDefined();
    expect(intent.payload).toMatchObject({
      payload: {
        recipients: [
          {
            channel: NOTIFICATION_CHANNEL.EMAIL,
            address: US_USER_EMAIL,
          },
        ],
      },
    });
  });

  it('lets user preferences suppress explicitly requested external delivery', async () => {
    await setNotificationPreference({
      userId,
      notificationType: NOTIFICATION_TYPE.USER_PROFILE_PICTURE_UPDATE_FAILED,
      channel: NOTIFICATION_CHANNEL.EMAIL,
      deliveryMode: 'off',
      trx,
    });

    const event = makeEvent({
      eventType: NOTIFICATION_TYPE.USER_PROFILE_PICTURE_UPDATE_FAILED,
      clientCompanyId: null,
      firmCompanyId: null,
      title: 'Profile picture update failed',
      body: 'Upload a new image to finish updating your profile.',
      sourceEntity: { type: 'user_profile', id: userId },
      deliveryPolicy: {
        mode: 'only',
        channels: [NOTIFICATION_CHANNEL.EMAIL],
      },
    });

    const result = await notify(event, { trx });

    expect(result).toMatchObject({
      notification: null,
      inserted: false,
      suppressed: true,
      commsRequested: 0,
    });
    await expect(commsIntentsFor(event)).resolves.toHaveLength(0);
  });

  it('supports deliveryPolicy only email without creating a feed row', async () => {
    const event = makeEvent({
      deliveryPolicy: { mode: 'only', channels: [NOTIFICATION_CHANNEL.EMAIL] },
    });

    const result = await notify(event, { trx });

    expect(result).toMatchObject({
      notification: null,
      inserted: false,
      suppressed: false,
      commsRequested: 1,
    });
    await expect(
      trx('app.notifications').where({
        recipient_user_id: userId,
        idempotency_key: event.idempotencyKey,
      }),
    ).resolves.toHaveLength(0);
    await expect(commsIntentsFor(event)).resolves.toHaveLength(1);
  });

  it('supports deliveryPolicy only in-app without writing comms intents', async () => {
    const event = makeEvent({
      deliveryPolicy: {
        mode: 'only',
        channels: [NOTIFICATION_CHANNEL.IN_APP],
      },
    });

    const result = await notify(event, { trx });

    expect(result.inserted).toBe(true);
    expect(result.notification).toBeTruthy();
    expect(result.commsRequested).toBe(0);
    await expect(commsIntentsFor(event)).resolves.toHaveLength(0);
  });

  it('supports deliveryPolicy except email using default routes minus email', async () => {
    const event = makeEvent({
      deliveryPolicy: {
        mode: 'except',
        channels: [NOTIFICATION_CHANNEL.EMAIL],
      },
    });

    const result = await notify(event, { trx });

    expect(result.inserted).toBe(true);
    expect(result.notification).toBeTruthy();
    expect(result.commsRequested).toBe(0);
    await expect(commsIntentsFor(event)).resolves.toHaveLength(0);
  });

  it('fails clearly when deliveryPolicy requests an unconfigured route', async () => {
    await expect(
      notify(
        makeEvent({
          deliveryPolicy: { mode: 'only', channels: ['sms'] },
        }),
        { trx },
      ),
    ).rejects.toThrow(
      `Notification delivery channel(s) sms are not configured for ${NOTIFICATION_TYPE.WORK_ASSIGNED}`,
    );
  });

  it('returns the in-app feed without a real comms provider', async () => {
    const created = await notify(makeEvent(), { trx });

    const feed = await getNotificationFeed({
      recipientUserId: userId,
      companyId,
      trx,
    });

    expect(feed.items.map((item) => item.id)).toContain(
      created.notification!.id,
    );
    expect(feed.nextCursor).toBeNull();
  });
});
