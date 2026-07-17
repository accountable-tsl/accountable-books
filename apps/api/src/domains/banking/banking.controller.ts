import type { Request, Response } from 'express';
import { z } from 'zod';

import { knexClient } from '../../db/knexClient.js';
import {
  connectAccountsService,
  transactionSyncService,
} from '../../integrations/banking/index.js';
import { providerRegistry } from '../../integrations/banking/providers/registry.js';
import { requestBankAccountSync } from '../../integrations/banking/transaction-sync.outbox.js';
import {
  ErrorCode,
  errorResponse,
  successResponse,
} from '../../shared/utils/response.utils.js';
import { getBankAccountSyncEligibility } from './bankAccounts/bankAccounts.model.js';
import { bankProviderKey } from './bankFeedProviders/bankFeedProviders.types.js';
import {
  revokeConnectionAndDestroySecret,
  stopFeedAndCancelSync,
} from './connection-lifecycle/lifecycle.commands.js';

import type { AuthRequest } from '../../features/auth/auth.types.js';

const bankAccountSyncBody = z.object({ bankAccountId: z.uuid() });

export class BankingController {
  async connectBankAccounts(req: AuthRequest, res: Response) {
    try {
      const userId = String(req.user?.id);
      const companyId = String(req.body.companyId);

      if (!userId || !companyId) {
        return res
          .status(400)
          .json(errorResponse('Missing user or company ID'));
      }

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
      const userId = req.user?.id;
      const companyId = req.user?.currentCompanyId;
      const feedId = String(req.params.feedId || '');
      if (!userId || !companyId || !feedId) {
        return res
          .status(400)
          .json(errorResponse('Missing user, company, or feed id'));
      }

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
      const userId = req.user?.id;
      const companyId = req.user?.currentCompanyId;
      const connectionId = String(req.params.connectionId || '');
      if (!userId || !companyId || !connectionId) {
        return res
          .status(400)
          .json(errorResponse('Missing user, company, or connection id'));
      }

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
      const userId = String(req.user?.id);
      const companyId = String(req.user?.currentCompanyId);
      const { accountId } = req.params;
      const { businessOrPersonal } = req.body;

      if (!userId || !companyId || !accountId) {
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

  async createLinkToken(req: Request, res: Response) {
    try {
      const { provider, userId, companyId } = req.body;

      if (
        !provider ||
        !bankProviderKey.options.includes(provider) ||
        !userId ||
        !companyId
      ) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: provider, userId, companyId',
        });
      }

      const providerInstance = await providerRegistry.get(provider);
      if (!providerInstance) {
        return res
          .status(400)
          .json(errorResponse(`Unsupported provider: ${provider}`));
      }

      const token = await providerInstance.createLinkToken({
        userId,
        companyId,
      });

      console.log({ token });

      const result = successResponse('Link token created', { token });

      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error: any) {
      res.status(500).json(errorResponse('Internal server error'));
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
      const companyId = String(req.user?.currentCompanyId);

      if (!provider || !companyId) {
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
      const userId = req.user?.id;
      const companyId = req.user?.currentCompanyId;
      const parsedBody = bankAccountSyncBody.safeParse(req.body);

      if (!userId || !companyId) {
        return res
          .status(400)
          .json(errorResponse('Missing user or company ID'));
      }

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
