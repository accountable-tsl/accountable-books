import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getCatalog } from '../catalog/catalog.controller.js';
import { getBillingCatalog } from '../catalog/catalog.service.js';

vi.mock('../catalog/catalog.service.js', () => ({
  getBillingCatalog: vi.fn(),
}));

function makeResponse() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
}

describe('billing catalog controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 for invalid currencyCode', async () => {
    const req = {
      query: { currencyCode: 'usd' },
    } as any;
    const res = makeResponse();

    await getCatalog(req, res as any);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(getBillingCatalog).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid at', async () => {
    const req = {
      query: { currencyCode: 'USD', at: 'not-a-date' },
    } as any;
    const res = makeResponse();

    await getCatalog(req, res as any);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(getBillingCatalog).not.toHaveBeenCalled();
  });

  it('forwards validated params to the service', async () => {
    vi.mocked(getBillingCatalog).mockResolvedValue({
      success: true,
      message: 'ok',
      data: {
        asOf: '2026-05-18T00:00:00.000Z',
        currencyCode: 'USD',
        plans: [],
      },
    });

    const req = {
      query: {
        currencyCode: 'USD',
        at: '2026-05-18T00:00:00.000Z',
      },
    } as any;
    const res = makeResponse();

    await getCatalog(req, res as any);

    expect(getBillingCatalog).toHaveBeenCalledWith({
      currencyCode: 'USD',
      at: new Date('2026-05-18T00:00:00.000Z'),
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('defaults at to undefined when omitted', async () => {
    vi.mocked(getBillingCatalog).mockResolvedValue({
      success: true,
      message: 'ok',
      data: {
        asOf: '2026-05-18T00:00:00.000Z',
        currencyCode: 'NGN',
        plans: [],
      },
    });

    const req = {
      query: { currencyCode: 'NGN' },
    } as any;
    const res = makeResponse();

    await getCatalog(req, res as any);

    expect(getBillingCatalog).toHaveBeenCalledWith({
      currencyCode: 'NGN',
      at: undefined,
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
