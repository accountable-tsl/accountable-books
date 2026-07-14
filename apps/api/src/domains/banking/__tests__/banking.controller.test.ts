import { randomUUID } from 'node:crypto';
import type { Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BankingController } from '../banking.controller.js';
import bankingRouter from '../banking.routes.js';

import type { AuthRequest } from '../../../features/auth/auth.types.js';

const mocks = vi.hoisted(() => ({
  getBankAccountSyncEligibility: vi.fn(),
  scheduleTransactionSync: vi.fn(),
  setTransactionSyncDate: vi.fn(),
}));

vi.mock('../bankAccounts/bankAccounts.model.js', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../bankAccounts/bankAccounts.model.js')
  >()),
  getBankAccountSyncEligibility: mocks.getBankAccountSyncEligibility,
}));

vi.mock('../../../integrations/banking/index.js', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../integrations/banking/index.js')
  >()),
  scheduleTransactionSync: mocks.scheduleTransactionSync,
  transactionSyncService: {
    setTransactionSyncDate: mocks.setTransactionSyncDate,
  },
}));

describe('banking transaction sync controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('queues only the selected company-owned account', async () => {
    const bankAccountId = randomUUID();
    const companyId = randomUUID();
    const userId = randomUUID();
    mocks.getBankAccountSyncEligibility.mockResolvedValue({
      id: bankAccountId,
      eligible: true,
      reason: null,
    });
    mocks.scheduleTransactionSync.mockResolvedValue({ id: 'job-1' });
    const { response, status, json } = responseDouble();

    await new BankingController().syncTransactions(
      {
        user: { id: userId, currentCompanyId: companyId },
        body: { bankAccountId },
      } as AuthRequest,
      response,
    );

    expect(mocks.getBankAccountSyncEligibility).toHaveBeenCalledWith({
      bankAccountId,
      companyId,
    });
    expect(mocks.scheduleTransactionSync).toHaveBeenCalledWith({
      bankAccountId,
      trigger: 'manual',
      actorUserId: userId,
    });
    expect(status).not.toHaveBeenCalled();
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ data: { jobId: 'job-1' } }),
    );
  });

  it('returns not found for a missing or other-company account', async () => {
    mocks.getBankAccountSyncEligibility.mockResolvedValue(null);
    const { response, status } = responseDouble();

    await new BankingController().syncTransactions(
      {
        user: { id: randomUUID(), currentCompanyId: randomUUID() },
        body: { bankAccountId: randomUUID() },
      } as AuthRequest,
      response,
    );

    expect(status).toHaveBeenCalledWith(404);
    expect(mocks.scheduleTransactionSync).not.toHaveBeenCalled();
  });

  it('returns reconnect-required for an errored company-owned account', async () => {
    const bankAccountId = randomUUID();
    mocks.getBankAccountSyncEligibility.mockResolvedValue({
      id: bankAccountId,
      eligible: false,
      reason: 'reconnect_required',
    });
    const { response, status, json } = responseDouble();

    await new BankingController().syncTransactions(
      {
        user: { id: randomUUID(), currentCompanyId: randomUUID() },
        body: { bankAccountId },
      } as AuthRequest,
      response,
    );

    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Bank account requires reconnection',
        reason: 'reconnect_required',
      }),
    );
    expect(mocks.scheduleTransactionSync).not.toHaveBeenCalled();
  });

  it('rejects a malformed account ID before querying', async () => {
    const { response, status } = responseDouble();

    await new BankingController().syncTransactions(
      {
        user: { id: randomUUID(), currentCompanyId: randomUUID() },
        body: { bankAccountId: 'not-a-uuid' },
      } as AuthRequest,
      response,
    );

    expect(status).toHaveBeenCalledWith(400);
    expect(mocks.getBankAccountSyncEligibility).not.toHaveBeenCalled();
    expect(mocks.scheduleTransactionSync).not.toHaveBeenCalled();
  });

  it('does not register the retired credential sync-status route', () => {
    const paths = bankingRouter.stack
      .map((layer) => layer.route?.path)
      .filter(Boolean);
    expect(paths).not.toContain('/sync-status/:credentialId');
  });
});

function responseDouble(): {
  response: Response;
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
} {
  const json = vi.fn();
  const status = vi.fn();
  const response = { status, json } as unknown as Response;
  status.mockReturnValue(response);
  return { response, status, json };
}
