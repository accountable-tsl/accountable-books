import type { Request, Response } from 'express';
import { z } from 'zod';

import { knexClient } from '../../db/knexClient.js';
import { connectAccountsService } from '../../integrations/banking/index.js';
import { providerRegistry } from '../../integrations/banking/providers/registry.js';
import { requestBankAccountSync } from '../../integrations/banking/transaction-sync.outbox.js';
import { getLogger } from '../../shared/utils/logger.js';
import {
  ErrorCode,
  errorResponse,
  getHttpStatusFromErrorCode,
  successResponse,
} from '../../shared/utils/response.utils.js';
import { loadSecretForConnectionReauthorization } from './bank-connection-secrets/bank-connection-secrets.model.js';
import { getBankAccountSyncEligibility } from './bankAccounts/bankAccounts.model.js';
import { bankProviderKey } from './bankFeedProviders/bankFeedProviders.types.js';
import {
  revokeConnectionAndDestroySecret,
  stopFeedAndCancelSync,
} from './connection-lifecycle/lifecycle.commands.js';

import type { AuthRequest } from '../../features/auth/auth.types.js';

const bankAccountSyncBody = z.object({ bankAccountId: z.uuid() });
const createLinkTokenBody = z.object({
  provider: bankProviderKey,
  connectionId: z.uuid().optional(),
});
const logger = getLogger({ component: 'banking-controller' });

/** Requires `checkCompanyId` middleware (sets `req.companyContext.uuid`). */
function requireBankingActor(req: AuthRequest) {
  const userId = req.user?.id;
  const companyId = req.companyContext?.uuid;
  if (!userId || !companyId) return null;
  return { userId, companyId };
}

export class BankingController {
  async connectBankAccounts(req: AuthRequest, res: Response) {
    try {
      const actor = requireBankingActor(req);

      if (!actor) {
        return res
          .status(400)
          .json(errorResponse('Missing user or company ID'));
      }
      const { userId, companyId } = actor;

      const {
        providerKey,
        publicToken,
        metadata,
        countryCode,
        confirmReplacement,
      } = req.body;

      if (!providerKey || !publicToken || !countryCode) {
        return res
          .status(400)
          .json(
            errorResponse(
              'Missing required fields: providerKey, publicToken, countryCode',
            ),
          );
      }

      const result = await connectAccountsService.connectBankAccounts({
        providerKey: providerKey,
        countryCode: countryCode,
        publicToken,
        metadata,
        companyId,
        userId,
        confirmReplacement: Boolean(confirmReplacement),
      });

      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error: unknown) {
      console.error('Error connecting bank accounts:', error);
      res.status(500).json(errorResponse('Internal server error'));
    }
  }

  async stopBankAccountFeed(req: AuthRequest, res: Response) {
    try {
      const actor = requireBankingActor(req);
      const feedId = String(req.params.feedId || '');
      if (!actor || !feedId) {
        return res
          .status(400)
          .json(errorResponse('Missing user, company, or feed id'));
      }
      const { userId, companyId } = actor;

      const result = await knexClient.transaction(async (trx) =>
        stopFeedAndCancelSync({
          feedId,
          companyId,
          revokedById: userId,
          revocationOrigin: 'client',
          revocationReason: 'Stopped by user',
          trx,
        }),
      );

      if (!result.success) {
        return res.status(400).json(result);
      }
      return res.json(result);
    } catch (error: unknown) {
      console.error('Error stopping bank account feed:', error);
      return res.status(500).json(errorResponse('Failed to stop feed'));
    }
  }

  async revokeBankConnection(req: AuthRequest, res: Response) {
    try {
      const actor = requireBankingActor(req);
      const connectionId = String(req.params.connectionId || '');
      if (!actor || !connectionId) {
        return res
          .status(400)
          .json(errorResponse('Missing user, company, or connection id'));
      }
      const { userId, companyId } = actor;

      const result = await knexClient.transaction(async (trx) =>
        revokeConnectionAndDestroySecret({
          connectionId,
          companyId,
          revokedById: userId,
          revocationOrigin: 'client',
          revocationReason: 'Revoked by user',
          trx,
        }),
      );

      if (!result.success) {
        return res.status(400).json(result);
      }
      return res.json(result);
    } catch (error: unknown) {
      console.error('Error revoking bank connection:', error);
      return res.status(500).json(errorResponse('Failed to revoke connection'));
    }
  }

  /**
   * Classify a bank account as business or personal
   */
  async classifyBankAccount(req: AuthRequest, res: Response) {
    try {
      const actor = requireBankingActor(req);
      const { accountId } = req.params;
      const { businessOrPersonal } = req.body;

      if (!actor || !accountId) {
        return res
          .status(400)
          .json(errorResponse('Missing required parameters'));
      }

      if (
        !businessOrPersonal ||
        !['business', 'personal'].includes(businessOrPersonal)
      ) {
        return res
          .status(400)
          .json(
            errorResponse(
              'businessOrPersonal must be either "business" or "personal"',
            ),
          );
      }

      const result = { success: false, note: '' };

      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error: unknown) {
      console.error('Error classifying bank account:', error);
      res.status(500).json(errorResponse('Internal server error'));
    }
  }

  async createLinkToken(req: AuthRequest, res: Response) {
    try {
      const actor = requireBankingActor(req);
      const parsedBody = createLinkTokenBody.safeParse(req.body);

      if (!actor) {
        return res.status(400).json({
          success: false,
          error: 'Missing authenticated user or company',
        });
      }
      const { userId, companyId } = actor;
      if (!parsedBody.success) {
        return res
          .status(400)
          .json(errorResponse('Invalid link token request'));
      }
      const { provider, connectionId } = parsedBody.data;

      const providerInstance = await providerRegistry.get(provider);
      if (!providerInstance) {
        return res
          .status(400)
          .json(errorResponse(`Unsupported provider: ${provider}`));
      }

      let accessToken: string | undefined;
      if (connectionId) {
        const secret = await loadSecretForConnectionReauthorization({
          connectionId,
          companyId,
          providerKey: provider,
        });
        if (!secret.success || !secret.data) {
          return res
            .status(409)
            .json(errorResponse('Bank connection cannot be reauthorized'));
        }
        accessToken = secret.data.access_token;
      }

      const token = await providerInstance.createLinkToken({
        userId,
        companyId,
        ...(accessToken ? { accessToken } : {}),
      });

      const result = successResponse('Link token created', {
        token,
        mode: accessToken ? 'reauthorization' : 'connect',
      });

      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error: any) {
      res.status(500).json(errorResponse('Internal server error'));
    }
  }

  async completeConnectionReauthorization(req: AuthRequest, res: Response) {
    try {
      const actor = requireBankingActor(req);
      const parsedConnectionId = z.uuid().safeParse(req.params.connectionId);
      if (!actor || !parsedConnectionId.success) {
        return res
          .status(400)
          .json(errorResponse('Missing user, company, or connection id'));
      }
      const { userId, companyId } = actor;
      const connectionId = parsedConnectionId.data;

      const result = await connectAccountsService.completeReauthorization({
        connectionId,
        companyId,
        userId,
      });
      if (!result.success) {
        const status = getHttpStatusFromErrorCode(result.code);
        logger.warn(
          { companyId, connectionId, userId, status, code: result.code },
          'Bank connection reauthorization failed',
        );
        return res.status(status).json(result);
      }
      logger.info(
        {
          companyId,
          connectionId,
          userId,
          selectedAccountCount: result.data?.accounts.length ?? 0,
        },
        'Bank connection reauthorization completed',
      );
      return res.json(result);
    } catch (error: unknown) {
      console.error('Error completing bank connection reauthorization:', error);
      return res
        .status(500)
        .json(errorResponse('Failed to complete reauthorization'));
    }
  }

  async getSupportedCountries(req: Request, res: Response) {
    try {
      const countries = await providerRegistry.getSupportedCountries();
      res.json(countries);
    } catch (error) {
      res.status(500).json(errorResponse('Internal server error'));
    }
  }

  async testConnection(req: AuthRequest, res: Response) {
    try {
      const { provider } = req.params;
      const actor = requireBankingActor(req);

      if (!provider || !actor) {
        return res
          .status(400)
          .json(errorResponse('Missing provider or company ID'));
      }

      // TODO: Implement getDecryptedToken when needed for transaction sync
      return res
        .status(501)
        .json(errorResponse('Token decryption not implemented yet'));
    } catch (error: any) {
      console.error('Test connection failed:', error);
      res
        .status(500)
        .json(errorResponse(`Connection test failed: ${error.message}`));
    }
  }

  /**
   * Manual transaction sync trigger
   * POST /api/banking/sync-transactions
   */
  async syncTransactions(req: AuthRequest, res: Response) {
    try {
      const actor = requireBankingActor(req);
      const parsedBody = bankAccountSyncBody.safeParse(req.body);

      if (!actor) {
        return res
          .status(400)
          .json(errorResponse('Missing user or company ID'));
      }
      const { userId, companyId } = actor;

      if (!parsedBody.success) {
        return res.status(400).json(errorResponse('Invalid bankAccountId'));
      }
      const { bankAccountId } = parsedBody.data;

      const account = await getBankAccountSyncEligibility({
        bankAccountId,
        companyId,
      });
      if (!account) {
        return res.status(404).json(
          errorResponse('Bank account not found', undefined, {
            code: ErrorCode.NOT_FOUND,
          }),
        );
      }
      if (!account.eligible) {
        const message =
          account.reason === 'reconnect_required'
            ? 'Bank account requires reconnection'
            : 'Bank account is not eligible for transaction sync';
        return res.status(409).json(
          errorResponse(message, undefined, {
            code: ErrorCode.OPERATION_NOT_ALLOWED,
            metadata: { reason: account.reason },
          }),
        );
      }

      const { id: outboxId } = await requestBankAccountSync({
        bankAccountId: account.id,
        trigger: 'manual',
        actorUserId: userId,
      });

      res.json(
        successResponse('Transaction sync queued successfully', {
          outboxId,
        }),
      );
    } catch (error: any) {
      console.error('Error queuing transaction sync:', error);
      res.status(500).json(errorResponse('Failed to queue transaction sync'));
    }
  }
}
