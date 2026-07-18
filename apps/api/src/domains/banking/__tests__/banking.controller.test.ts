import { randomUUID } from 'node:crypto';
import type { Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { knexClient } from '../../../db/knexClient.js';
import { connectAccountsService } from '../../../integrations/banking/index.js';
import { providerRegistry } from '../../../integrations/banking/providers/registry.js';
import { BankingController } from '../banking.controller.js';
import bankingRouter from '../banking.routes.js';

import type { AuthRequest } from '../../../features/auth/auth.types.js';

const mocks = vi.hoisted(() => ({
  completeConnectionReauthorization: vi.fn(),
  getCompanyUUID: vi.fn(),
  getBankAccountSyncEligibility: vi.fn(),
  loadSecretForConnectionReauthorization: vi.fn(),
  requestBankAccountSync: vi.fn(),
}));

vi.mock('../bankAccounts/bankAccounts.model.js', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../bankAccounts/bankAccounts.model.js')
  >()),
  getBankAccountSyncEligibility: mocks.getBankAccountSyncEligibility,
}));

vi.mock('../../../integrations/banking/transaction-sync.outbox.js', () => ({
  requestBankAccountSync: mocks.requestBankAccountSync,
}));

vi.mock('../../../shared/utils/random.utils.js', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../shared/utils/random.utils.js')
  >()),
  getCompanyUUID: mocks.getCompanyUUID,
}));

vi.mock(
  '../bank-connection-secrets/bank-connection-secrets.model.js',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../bank-connection-secrets/bank-connection-secrets.model.js')
    >()),
    loadSecretForConnectionReauthorization:
      mocks.loadSecretForConnectionReauthorization,
  }),
);

vi.mock(
  '../connection-lifecycle/lifecycle.commands.js',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../connection-lifecycle/lifecycle.commands.js')
    >()),
    completeConnectionReauthorization: mocks.completeConnectionReauthorization,
  }),
);

describe('banking transaction sync controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCompanyUUID.mockImplementation(
      async (identifier: string) => identifier,
    );
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
    mocks.requestBankAccountSync.mockResolvedValue({ id: 'outbox-1' });
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
    expect(mocks.requestBankAccountSync).toHaveBeenCalledWith({
      bankAccountId,
      trigger: 'manual',
      actorUserId: userId,
    });
    expect(status).not.toHaveBeenCalled();
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ data: { outboxId: 'outbox-1' } }),
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
    expect(mocks.requestBankAccountSync).not.toHaveBeenCalled();
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
    expect(mocks.requestBankAccountSync).not.toHaveBeenCalled();
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
    expect(mocks.requestBankAccountSync).not.toHaveBeenCalled();
  });

  it('does not register the retired credential sync-status route', () => {
    const paths = bankingRouter.stack
      .map((layer) => layer.route?.path)
      .filter(Boolean);
    expect(paths).not.toContain('/sync-status/:credentialId');
    expect(paths).not.toContain('/set-sync-date');
  });
});

describe('bank connection controller ownership', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.completeConnectionReauthorization.mockReset();
    mocks.getCompanyUUID.mockReset();
    mocks.getCompanyUUID.mockImplementation(
      async (identifier: string) => identifier,
    );
    mocks.loadSecretForConnectionReauthorization.mockReset();
  });

  it('connects accounts only to the authenticated company', async () => {
    const authenticatedCompanyId = randomUUID();
    const authenticatedCompanyIdentifier = 'authenticated-company';
    const submittedCompanyId = randomUUID();
    const userId = randomUUID();
    mocks.getCompanyUUID.mockResolvedValue(authenticatedCompanyId);
    const connect = vi
      .spyOn(connectAccountsService, 'connectBankAccounts')
      .mockResolvedValue({
        success: true,
        message: 'Connected',
        data: {
          bank: { id: randomUUID(), name: 'Bank', logoUrl: null },
          accounts: [],
          outcome: 'connected',
        },
      });
    const { response, json } = responseDouble();

    await new BankingController().connectBankAccounts(
      {
        user: {
          id: userId,
          currentCompanyId: authenticatedCompanyIdentifier,
        },
        body: {
          providerKey: 'plaid',
          countryCode: 'US',
          publicToken: 'public-token',
          companyId: submittedCompanyId,
        },
      } as AuthRequest,
      response,
    );

    expect(connect).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: authenticatedCompanyId,
        userId,
      }),
    );
    expect(mocks.getCompanyUUID).toHaveBeenCalledWith(
      authenticatedCompanyIdentifier,
    );
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true }),
    );
  });

  it('creates link tokens for the authenticated user and company', async () => {
    const authenticatedCompanyId = randomUUID();
    const authenticatedCompanyIdentifier = 'authenticated-company';
    const authenticatedUserId = randomUUID();
    mocks.getCompanyUUID.mockResolvedValue(authenticatedCompanyId);
    const createLinkToken = vi.fn().mockResolvedValue('safe-link-token');
    vi.spyOn(providerRegistry, 'get').mockResolvedValue({
      createLinkToken,
    } as never);
    const { response, json } = responseDouble();

    await new BankingController().createLinkToken(
      {
        user: {
          id: authenticatedUserId,
          currentCompanyId: authenticatedCompanyIdentifier,
        },
        body: {
          provider: 'plaid',
          userId: randomUUID(),
          companyId: randomUUID(),
        },
      } as AuthRequest,
      response,
    );

    expect(createLinkToken).toHaveBeenCalledWith({
      userId: authenticatedUserId,
      companyId: authenticatedCompanyId,
    });
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ token: 'safe-link-token' }),
      }),
    );
  });

  it('creates a reauthorization token only from the authenticated company connection', async () => {
    const companyId = randomUUID();
    const companyIdentifier = 'authenticated-company';
    const userId = randomUUID();
    const connectionId = randomUUID();
    mocks.getCompanyUUID.mockResolvedValue(companyId);
    const createLinkToken = vi.fn().mockResolvedValue('update-token');
    vi.spyOn(providerRegistry, 'get').mockResolvedValue({
      createLinkToken,
    } as never);
    mocks.loadSecretForConnectionReauthorization.mockResolvedValue({
      success: true,
      data: { access_token: 'stored-access-token' },
    });
    const { response, json } = responseDouble();

    await new BankingController().createLinkToken(
      {
        user: { id: userId, currentCompanyId: companyIdentifier },
        body: { provider: 'plaid', connectionId },
      } as AuthRequest,
      response,
    );

    expect(mocks.loadSecretForConnectionReauthorization).toHaveBeenCalledWith({
      connectionId,
      companyId,
      providerKey: 'plaid',
    });
    expect(createLinkToken).toHaveBeenCalledWith({
      userId,
      companyId,
      accessToken: 'stored-access-token',
    });
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ mode: 'reauthorization' }),
      }),
    );
  });

  it('completes reauthorization only for the authenticated company', async () => {
    const companyId = randomUUID();
    const companyIdentifier = 'authenticated-company';
    const userId = randomUUID();
    const connectionId = randomUUID();
    mocks.getCompanyUUID.mockResolvedValue(companyId);
    mocks.completeConnectionReauthorization.mockResolvedValue({
      success: true,
      message: 'Bank connection reauthorized',
      data: { id: connectionId, syncsQueued: 2 },
    });
    vi.spyOn(knexClient, 'transaction').mockImplementation(async (handler) => {
      if (typeof handler !== 'function') {
        throw new Error('Expected transaction handler');
      }
      return handler(vi.fn() as never) as never;
    });
    const { response, json } = responseDouble();

    await new BankingController().completeConnectionReauthorization(
      {
        user: { id: userId, currentCompanyId: companyIdentifier },
        params: { connectionId },
        body: { companyId: randomUUID() },
      } as unknown as AuthRequest,
      response,
    );

    expect(mocks.completeConnectionReauthorization).toHaveBeenCalledWith({
      connectionId,
      companyId,
      updatedById: userId,
      trx: expect.any(Function),
    });
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true }),
    );
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
