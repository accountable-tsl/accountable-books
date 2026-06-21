import type { Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createTestTransaction } from '../../../../config/test-db.js';
import {
  getTestUserId,
  getTestCompanyId,
  US_USER_EMAIL,
} from '../../../../test/helpers.js';
import { listNotificationEventDefinitions } from '../notification-event-registry.js';
import {
  listNotificationPreferences,
  resolveEffectiveNotificationPreference,
  resolveNotificationPreference,
  setCompanyNotificationPreference,
  setNotificationPreference,
  SUPPORTED_NOTIFICATION_PREFERENCE_CHANNELS,
  SUPPORTED_NOTIFICATION_PREFERENCE_DELIVERY_MODES,
} from '../notification-preferences.js';
import {
  NOTIFICATION_CHANNEL,
  NOTIFICATION_TYPE,
} from '../notifications.types.js';

describe('notification preferences', () => {
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

  it('lists live defaults for every supported event/channel pair', async () => {
    const preferences = await listNotificationPreferences({ userId, trx });

    expect(preferences).toHaveLength(
      listNotificationEventDefinitions().length *
        SUPPORTED_NOTIFICATION_PREFERENCE_CHANNELS.length,
    );
    expect(
      new Set(preferences.map((preference) => preference.channel)),
    ).toEqual(new Set(SUPPORTED_NOTIFICATION_PREFERENCE_CHANNELS));
    expect(
      preferences.every((preference) =>
        SUPPORTED_NOTIFICATION_PREFERENCE_DELIVERY_MODES.includes(
          preference.deliveryMode,
        ),
      ),
    ).toBe(true);
    expect(preferences.every((preference) => preference.source === 'default'))
      .toBe(true);
  });

  it('sets and resolves a user override for a supported preference', async () => {
    const updated = await setNotificationPreference({
      userId,
      notificationType: NOTIFICATION_TYPE.WORK_ASSIGNED,
      channel: NOTIFICATION_CHANNEL.EMAIL,
      deliveryMode: 'off',
      trx,
    });

    expect(updated).toMatchObject({
      userId,
      notificationType: NOTIFICATION_TYPE.WORK_ASSIGNED,
      channel: NOTIFICATION_CHANNEL.EMAIL,
      deliveryMode: 'off',
      source: 'user',
    });

    await expect(
      resolveNotificationPreference({
        userId,
        notificationType: NOTIFICATION_TYPE.WORK_ASSIGNED,
        channel: NOTIFICATION_CHANNEL.EMAIL,
        trx,
      }),
    ).resolves.toMatchObject({
      deliveryMode: 'off',
      source: 'user',
    });
  });

  it('uses a company default when no user override exists', async () => {
    await setCompanyNotificationPreference({
      companyId,
      notificationType: NOTIFICATION_TYPE.WORK_ASSIGNED,
      channel: NOTIFICATION_CHANNEL.EMAIL,
      deliveryMode: 'off',
      trx,
    });

    await expect(
      resolveEffectiveNotificationPreference({
        userId,
        policyOwnerCompanyId: companyId,
        notificationType: NOTIFICATION_TYPE.WORK_ASSIGNED,
        channel: NOTIFICATION_CHANNEL.EMAIL,
        candidateDeliveryMode: 'immediate',
        trx,
      }),
    ).resolves.toMatchObject({
      deliveryMode: 'off',
      source: 'company',
    });
  });

  it('lets user overrides win over company defaults', async () => {
    await setCompanyNotificationPreference({
      companyId,
      notificationType: NOTIFICATION_TYPE.WORK_ASSIGNED,
      channel: NOTIFICATION_CHANNEL.EMAIL,
      deliveryMode: 'off',
      trx,
    });
    await setNotificationPreference({
      userId,
      notificationType: NOTIFICATION_TYPE.WORK_ASSIGNED,
      channel: NOTIFICATION_CHANNEL.EMAIL,
      deliveryMode: 'immediate',
      trx,
    });

    await expect(
      resolveEffectiveNotificationPreference({
        userId,
        policyOwnerCompanyId: companyId,
        notificationType: NOTIFICATION_TYPE.WORK_ASSIGNED,
        channel: NOTIFICATION_CHANNEL.EMAIL,
        candidateDeliveryMode: 'immediate',
        trx,
      }),
    ).resolves.toMatchObject({
      deliveryMode: 'immediate',
      source: 'user',
    });
  });

  it('does not leak company defaults into global/user-account resolution', async () => {
    await setCompanyNotificationPreference({
      companyId,
      notificationType: NOTIFICATION_TYPE.USER_PROFILE_PICTURE_UPDATE_FAILED,
      channel: NOTIFICATION_CHANNEL.EMAIL,
      deliveryMode: 'off',
      trx,
    });

    await expect(
      resolveEffectiveNotificationPreference({
        userId,
        policyOwnerCompanyId: null,
        notificationType: NOTIFICATION_TYPE.USER_PROFILE_PICTURE_UPDATE_FAILED,
        channel: NOTIFICATION_CHANNEL.EMAIL,
        candidateDeliveryMode: 'immediate',
        trx,
      }),
    ).resolves.toMatchObject({
      deliveryMode: 'immediate',
      source: 'default',
    });
  });

  it('keeps company defaults out of the user preference listing', async () => {
    await setCompanyNotificationPreference({
      companyId,
      notificationType: NOTIFICATION_TYPE.WORK_ASSIGNED,
      channel: NOTIFICATION_CHANNEL.EMAIL,
      deliveryMode: 'off',
      trx,
    });

    const preferences = await listNotificationPreferences({ userId, trx });
    const workAssignedEmail = preferences.find(
      (preference) =>
        preference.notificationType === NOTIFICATION_TYPE.WORK_ASSIGNED &&
        preference.channel === NOTIFICATION_CHANNEL.EMAIL,
    );

    expect(workAssignedEmail).toMatchObject({
      deliveryMode: 'immediate',
      source: 'default',
    });
  });

  it('rejects unsupported preference inputs', async () => {
    await expect(
      setNotificationPreference({
        userId,
        notificationType: 'unknown.type',
        channel: NOTIFICATION_CHANNEL.EMAIL,
        deliveryMode: 'immediate',
        trx,
      }),
    ).rejects.toThrow('Unsupported notification preference type');

    await expect(
      setNotificationPreference({
        userId,
        notificationType: NOTIFICATION_TYPE.WORK_ASSIGNED,
        channel: 'sms',
        deliveryMode: 'immediate',
        trx,
      }),
    ).rejects.toThrow('Unsupported notification preference channel');

    await expect(
      setCompanyNotificationPreference({
        companyId,
        notificationType: NOTIFICATION_TYPE.WORK_ASSIGNED,
        channel: NOTIFICATION_CHANNEL.EMAIL,
        deliveryMode: 'digest' as never,
        trx,
      }),
    ).rejects.toThrow('Unsupported notification preference delivery mode');
  });
});
