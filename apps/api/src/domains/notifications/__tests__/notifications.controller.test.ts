import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  setNotificationPreference,
  SUPPORTED_NOTIFICATION_PREFERENCE_CHANNELS,
  SUPPORTED_NOTIFICATION_PREFERENCE_DELIVERY_MODES,
} from '../notification-preferences.js';
import { setNotificationPreferenceController } from '../notifications.controller.js';
import {
  NOTIFICATION_CHANNEL,
  NOTIFICATION_TYPE,
} from '../notifications.types.js';

vi.mock('../notification-preferences.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../notification-preferences.js')>();
  return {
    ...actual,
    setNotificationPreference: vi.fn(),
  };
});

function makeResponse() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
}

describe('notifications controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unsupported preference channels before writing', async () => {
    const req = {
      user: { id: '11111111-1111-4111-8111-111111111111' },
      companyContext: { uuid: '22222222-2222-4222-8222-222222222222' },
      body: {
        notificationType: NOTIFICATION_TYPE.WORK_ASSIGNED,
        channel: 'sms',
        deliveryMode: 'immediate',
      },
    };
    const res = makeResponse();

    await setNotificationPreferenceController(req as any, res as any);

    expect(setNotificationPreference).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: 'Invalid notification preference',
      }),
    );
    expect(SUPPORTED_NOTIFICATION_PREFERENCE_CHANNELS).toEqual([
      NOTIFICATION_CHANNEL.IN_APP,
      NOTIFICATION_CHANNEL.EMAIL,
    ]);
  });

  it('rejects unsupported preference delivery modes before writing', async () => {
    const req = {
      user: { id: '11111111-1111-4111-8111-111111111111' },
      companyContext: { uuid: '22222222-2222-4222-8222-222222222222' },
      body: {
        notificationType: NOTIFICATION_TYPE.WORK_ASSIGNED,
        channel: NOTIFICATION_CHANNEL.EMAIL,
        deliveryMode: 'digest',
      },
    };
    const res = makeResponse();

    await setNotificationPreferenceController(req as any, res as any);

    expect(setNotificationPreference).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: 'Invalid notification preference',
      }),
    );
    expect(SUPPORTED_NOTIFICATION_PREFERENCE_DELIVERY_MODES).toEqual([
      'off',
      'immediate',
    ]);
  });
});
