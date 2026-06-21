import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getNotificationPreferencesController,
  setNotificationPreferenceController,
} from '../notifications.controller.js';

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

  it('does not expose user-configurable notification preferences in v1', async () => {
    const req = {
      user: { id: '11111111-1111-4111-8111-111111111111' },
      companyContext: { uuid: '22222222-2222-4222-8222-222222222222' },
    };
    const res = makeResponse();

    await getNotificationPreferencesController(req as any, res as any);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: 'Notification preferences are managed automatically',
        data: {
          configurable: false,
          items: [],
          supportedChannels: [],
          supportedDeliveryModes: [],
        },
      }),
    );
  });

  it('rejects public notification preference updates in v1', async () => {
    const req = {
      user: { id: '11111111-1111-4111-8111-111111111111' },
      companyContext: { uuid: '22222222-2222-4222-8222-222222222222' },
      body: {},
    };
    const res = makeResponse();

    await setNotificationPreferenceController(req as any, res as any);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: 'Notification preferences are managed automatically',
      }),
    );
  });
});
