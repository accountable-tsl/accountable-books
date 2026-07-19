import { randomUUID } from 'node:crypto';
import type { Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { connectAccountsService } from '../../../integrations/banking/index.js';
import { providerRegistry } from '../../../integrations/banking/providers/registry.js';
import { BankingController } from '../banking.controller.js';
import bankingRouter from '../banking.routes.js';

import type { AuthRequest } from '../../../features/auth/auth.types.js';

const mocks = vi.hoisted(() => ({
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

function companyContext(companyId: string) {
  return {
    identifier: companyId,
    uuid: companyId,
    shortCode: 'co',
  };
}

function authedReq(overrides: {
  user: { id: string };
  companyContext?: ReturnType<typeof companyContext>;
  body?: unknown;
  params?: Record<string, string>;
}): AuthRequest {
  return {
    companyContext: overrides.companyContext ?? companyContext(randomUUID()),
    ...overrides,
  } as AuthRequest;
}

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
    mocks.requestBankAccountSync.mockResolvedValue({ id: 'outbox-1' });
    const { response, status, json } = responseDouble();

    await new BankingController().syncTransactions(
      authedReq({
        user: { id: userId },
        companyContext: companyContext(companyId),
        body: { bankAccountId },
      }),
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
      authedReq({
        user: { id: randomUUID() },
        body: { bankAccountId: randomUUID() },
      }),
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
      authedReq({
        user: { id: randomUUID() },
        body: { bankAccountId },
      }),
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
      authedReq({
        user: { id: randomUUID() },
        body: { bankAccountId: 'not-a-uuid' },
      }),
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

  it('applies checkCompanyId to all routes after supported-countries', () => {
    const paths = bankingRouter.stack
      .filter((layer) => layer.route)
      .map((layer) => layer.route!.path);

    expect(paths[0]).toBe('/supported-countries');
    expect(paths).toEqual(
      expect.arrayContaining([
        '/link-token',
        '/connect-accounts',
        '/sync-transactions',
      ]),
    );

    // Router-level checkCompanyId sits between supported-countries and the rest
    const supportedIdx = bankingRouter.stack.findIndex(
      (layer) => layer.route?.path === '/supported-countries',
    );
    const companyGateIdx = bankingRouter.stack.findIndex(
      (layer) => !layer.route && typeof layer.handle === 'function',
    );
    const linkTokenIdx = bankingRouter.stack.findIndex(
      (layer) => layer.route?.path === '/link-token',
    );

    expect(companyGateIdx).toBeGreaterThan(supportedIdx);
    expect(linkTokenIdx).toBeGreaterThan(companyGateIdx);
  });
});

describe('bank connection controller ownership', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.loadSecretForConnectionReauthorization.mockReset();
  });

  it('connects accounts only to the authenticated company', async () => {
    const authenticatedCompanyId = randomUUID();
    const submittedCompanyId = randomUUID();
    const userId = randomUUID();
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
      authedReq({
        user: { id: userId },
        companyContext: companyContext(authenticatedCompanyId),
        body: {
          providerKey: 'plaid',
          countryCode: 'US',
          publicToken: 'public-token',
          companyId: submittedCompanyId,
        },
      }),
      response,
    );

    expect(connect).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: authenticatedCompanyId,
        userId,
      }),
    );
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true }),
    );
  });

  it('creates link tokens for the authenticated user and company', async () => {
    const authenticatedCompanyId = randomUUID();
    const authenticatedUserId = randomUUID();
    const createLinkToken = vi.fn().mockResolvedValue('safe-link-token');
    vi.spyOn(providerRegistry, 'get').mockResolvedValue({
      createLinkToken,
    } as never);
    const { response, json } = responseDouble();

    await new BankingController().createLinkToken(
      authedReq({
        user: { id: authenticatedUserId },
        companyContext: companyContext(authenticatedCompanyId),
        body: {
          provider: 'plaid',
          userId: randomUUID(),
          companyId: randomUUID(),
        },
      }),
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
    const userId = randomUUID();
    const connectionId = randomUUID();
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
      authedReq({
        user: { id: userId },
        companyContext: companyContext(companyId),
        body: { provider: 'plaid', connectionId, companyId },
      }),
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
    const userId = randomUUID();
    const connectionId = randomUUID();
    const complete = vi
      .spyOn(connectAccountsService, 'completeReauthorization')
      .mockResolvedValue({
        success: true,
        message: 'Bank connection reauthorized',
        data: {
          bank: { id: randomUUID(), name: 'Bank', logoUrl: null },
          accounts: [],
          outcome: 'reauthorized',
        },
      });
    const { response, json } = responseDouble();

    await new BankingController().completeConnectionReauthorization(
      authedReq({
        user: { id: userId },
        companyContext: companyContext(companyId),
        params: { connectionId },
        body: { companyId: randomUUID() },
      }),
      response,
    );

    expect(complete).toHaveBeenCalledWith({
      connectionId,
      companyId,
      userId,
    });
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true }),
    );
  });

  it('returns a service error when the provider cannot complete reauthorization', async () => {
    const companyId = randomUUID();
    const userId = randomUUID();
    const connectionId = randomUUID();
    vi.spyOn(
      connectAccountsService,
      'completeReauthorization',
    ).mockResolvedValue({
      success: false,
      message: 'Bank provider reauthorization failed',
      code: 'SERVICE_UNAVAILABLE',
    });
    const { response, status } = responseDouble();

    await new BankingController().completeConnectionReauthorization(
      authedReq({
        user: { id: userId },
        companyContext: companyContext(companyId),
        params: { connectionId },
      }),
      response,
    );

    expect(status).toHaveBeenCalledWith(503);
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
