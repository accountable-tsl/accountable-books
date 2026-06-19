import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getWorkQueueController } from '../work-queue.controller.js';
import { getWorkQueue } from '../work-queue.read.js';

vi.mock('../work-queue.read.js', () => ({
  getWorkQueue: vi.fn(),
}));

function makeResponse() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
}

describe('work queue controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes firm company and viewer context to the queue read model', async () => {
    vi.mocked(getWorkQueue).mockResolvedValue({
      firmCompanyId: 'firm-company-id',
      items: [],
    });

    const req = {
      user: { id: 'user-id' },
      companyContext: { uuid: 'firm-company-id' },
      company: {
        roleKey: 'staff',
        roleScope: 'firm',
        accessOrigin: 'explicit_firm',
      },
    } as any;
    const res = makeResponse();

    await getWorkQueueController(req, res as any);

    expect(getWorkQueue).toHaveBeenCalledWith({
      firmCompanyId: 'firm-company-id',
      viewer: {
        userId: 'user-id',
        roleKey: 'staff',
        roleScope: 'firm',
        accessOrigin: 'explicit_firm',
      },
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 401 when user context is missing', async () => {
    const req = {
      companyContext: { uuid: 'firm-company-id' },
      company: {
        roleKey: 'staff',
        roleScope: 'firm',
        accessOrigin: 'explicit_firm',
      },
    } as any;
    const res = makeResponse();

    await getWorkQueueController(req, res as any);

    expect(getWorkQueue).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
