import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getTrialBalanceController,
  refreshTrialBalanceController,
} from '../balances.controller.js';
import { getTrialBalance, refreshTrialBalance } from '../balances.model.js';

vi.mock('../balances.model.js', () => ({
  getTrialBalance: vi.fn(),
  refreshTrialBalance: vi.fn(),
}));

function makeResponse() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
}

describe('balances controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes company-only trial balance requests through for default period resolution', async () => {
    vi.mocked(getTrialBalance).mockResolvedValue({
      success: true,
      message: 'ok',
      data: {
        period: {
          kind: 'fiscal_period',
          fiscalYear: 2025,
          periodNumber: 1,
          periodType: 'monthly',
          startDate: '2025-01-01',
          endDate: '2025-01-31',
          requestedStartDate: '2025-01-01',
          requestedEndDate: '2025-01-31',
          effectiveStartDate: '2025-01-01',
          effectiveEndDate: '2025-01-31',
          status: 'open',
          defaulted: true,
          isFutureRange: false,
          isOpenRange: true,
        },
        currency: { code: 'USD', minorUnit: 2 },
        accounts: [],
        totals: {
          openingDebit: '0.00',
          openingCredit: '0.00',
          periodDebit: '0.00',
          periodCredit: '0.00',
          closingDebit: '0.00',
          closingCredit: '0.00',
        },
        checks: {
          opening: { balanced: true, difference: '0.000' },
          movement: { balanced: true, difference: '0.000' },
          closing: { balanced: true, difference: '0.000' },
        },
        freshness: {
          status: 'fresh',
          calculatedAtMin: null,
          calculatedAtMax: null,
          missingCoaIds: [],
          staleCoaIds: [],
          generatedAt: '2026-06-14T00:00:00.000Z',
        },
      },
    });

    const req = {
      query: {},
      companyContext: { uuid: 'company-uuid' },
    } as any;
    const res = makeResponse();

    await getTrialBalanceController(req, res as any);

    expect(getTrialBalance).toHaveBeenCalledWith({
      companyId: 'company-uuid',
      fiscalYear: undefined,
      periodNumber: undefined,
      periodType: 'monthly',
      includeZeroBalances: true,
      asOfDate: undefined,
      fromDate: undefined,
      toDate: undefined,
    });
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true }),
    );
  });

  it('accepts explicit periodNumber and includeZeroBalances=false', async () => {
    vi.mocked(getTrialBalance).mockResolvedValue({
      success: true,
      message: 'ok',
      data: {} as any,
    });

    const req = {
      query: {
        fiscalYear: '2025',
        periodNumber: '2',
        periodType: 'monthly',
        includeZeroBalances: 'false',
        asOfDate: '2025-02-14',
      },
      companyContext: { uuid: 'company-uuid' },
    } as any;
    const res = makeResponse();

    await getTrialBalanceController(req, res as any);

    expect(getTrialBalance).toHaveBeenCalledWith({
      companyId: 'company-uuid',
      fiscalYear: 2025,
      periodNumber: 2,
      periodType: 'monthly',
      includeZeroBalances: false,
      asOfDate: '2025-02-14',
      fromDate: undefined,
      toDate: undefined,
    });
  });

  it('accepts arbitrary date-range trial balance requests on the same endpoint', async () => {
    vi.mocked(getTrialBalance).mockResolvedValue({
      success: true,
      message: 'ok',
      data: {} as any,
    });

    const req = {
      query: {
        fromDate: '2026-06-01',
        toDate: '2026-06-30',
      },
      companyContext: { uuid: 'company-uuid' },
    } as any;
    const res = makeResponse();

    await getTrialBalanceController(req, res as any);

    expect(getTrialBalance).toHaveBeenCalledWith({
      companyId: 'company-uuid',
      fiscalYear: undefined,
      periodNumber: undefined,
      periodType: 'monthly',
      includeZeroBalances: true,
      asOfDate: undefined,
      fromDate: '2026-06-01',
      toDate: '2026-06-30',
    });
  });

  it('rejects mixed fiscal-period and date-range trial balance selectors', async () => {
    const req = {
      query: {
        fiscalYear: '2026',
        periodNumber: '6',
        fromDate: '2026-06-01',
        toDate: '2026-06-30',
      },
      companyContext: { uuid: 'company-uuid' },
    } as any;
    const res = makeResponse();

    await getTrialBalanceController(req, res as any);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(getTrialBalance).not.toHaveBeenCalled();
  });

  it('rejects conflicting fiscalPeriod and periodNumber aliases', async () => {
    const req = {
      query: {
        fiscalYear: '2025',
        fiscalPeriod: '1',
        periodNumber: '2',
      },
      companyContext: { uuid: 'company-uuid' },
    } as any;
    const res = makeResponse();

    await getTrialBalanceController(req, res as any);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(getTrialBalance).not.toHaveBeenCalled();
  });

  it('rejects partial explicit period selection', async () => {
    const req = {
      query: { fiscalYear: '2025' },
      companyContext: { uuid: 'company-uuid' },
    } as any;
    const res = makeResponse();

    await getTrialBalanceController(req, res as any);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(getTrialBalance).not.toHaveBeenCalled();
  });

  it('passes trial balance refresh requests through with body values overriding query values', async () => {
    vi.mocked(refreshTrialBalance).mockResolvedValue({
      success: true,
      message: 'Trial balance refresh queued',
      data: {
        period: {
          kind: 'fiscal_period',
          fiscalYear: 2025,
          periodNumber: 2,
          periodType: 'monthly',
          startDate: '2025-02-01',
          endDate: '2025-02-28',
          requestedStartDate: '2025-02-01',
          requestedEndDate: '2025-02-28',
          effectiveStartDate: '2025-02-01',
          effectiveEndDate: '2025-02-28',
          status: 'open',
          defaulted: false,
          isFutureRange: false,
          isOpenRange: true,
        },
        freshnessBeforeRefresh: {
          status: 'stale',
          calculatedAtMin: null,
          calculatedAtMax: null,
          missingCoaIds: [],
          staleCoaIds: ['coa-1'],
          generatedAt: '2026-06-14T00:00:00.000Z',
        },
        accountsTargeted: 1,
        jobsQueued: 1,
        jobs: [{ coaId: 'coa-1', jobId: 'job-1', recalcFrom: '2025-02-01' }],
      },
    });

    const req = {
      query: {
        fiscalYear: '2025',
        periodNumber: '1',
      },
      body: {
        fiscalYear: 2025,
        periodNumber: 2,
        periodType: 'monthly',
        includeFreshAccounts: true,
      },
      companyContext: { uuid: 'company-uuid' },
    } as any;
    const res = makeResponse();

    await refreshTrialBalanceController(req, res as any);

    expect(refreshTrialBalance).toHaveBeenCalledWith({
      companyId: 'company-uuid',
      fiscalYear: 2025,
      periodNumber: 2,
      periodType: 'monthly',
      asOfDate: undefined,
      fromDate: undefined,
      toDate: undefined,
      includeFreshAccounts: true,
    });
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true }),
    );
  });

  it('defaults trial balance refresh to the current monthly period and stale-only targeting', async () => {
    vi.mocked(refreshTrialBalance).mockResolvedValue({
      success: true,
      message: 'Trial balance is already fresh',
      data: {} as any,
    });

    const req = {
      query: {},
      body: {},
      companyContext: { uuid: 'company-uuid' },
    } as any;
    const res = makeResponse();

    await refreshTrialBalanceController(req, res as any);

    expect(refreshTrialBalance).toHaveBeenCalledWith({
      companyId: 'company-uuid',
      fiscalYear: undefined,
      periodNumber: undefined,
      periodType: 'monthly',
      asOfDate: undefined,
      fromDate: undefined,
      toDate: undefined,
      includeFreshAccounts: false,
    });
  });

  it('passes date-range trial balance refresh requests through', async () => {
    vi.mocked(refreshTrialBalance).mockResolvedValue({
      success: true,
      message: 'Trial balance refresh queued',
      data: {} as any,
    });

    const req = {
      query: {},
      body: {
        fromDate: '2026-06-01',
        toDate: '2026-06-30',
      },
      companyContext: { uuid: 'company-uuid' },
    } as any;
    const res = makeResponse();

    await refreshTrialBalanceController(req, res as any);

    expect(refreshTrialBalance).toHaveBeenCalledWith({
      companyId: 'company-uuid',
      fiscalYear: undefined,
      periodNumber: undefined,
      periodType: 'monthly',
      asOfDate: undefined,
      fromDate: '2026-06-01',
      toDate: '2026-06-30',
      includeFreshAccounts: false,
    });
  });

  it('rejects invalid trial balance refresh requests', async () => {
    const req = {
      query: {
        fiscalYear: '2025',
        fiscalPeriod: '1',
        periodNumber: '2',
      },
      body: {},
      companyContext: { uuid: 'company-uuid' },
    } as any;
    const res = makeResponse();

    await refreshTrialBalanceController(req, res as any);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(refreshTrialBalance).not.toHaveBeenCalled();
  });
});
