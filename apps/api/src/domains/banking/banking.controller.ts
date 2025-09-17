import type { Request, Response } from 'express';
import { connectAccountsService } from '../../integrations/banking/services/connectAccounts.service.js';
import {
  errorResponse,
  successResponse,
} from '../../shared/utils/response.utils.js';
import type { AuthRequest } from '../../features/auth/auth.types.js';
import { providerRegistry } from '../../integrations/banking/providers/registry.js';
import { bankProviderKey } from './bankFeedProviders/bankFeedProviders.types.js';
import { transactionSyncQueue } from '../../jobs/queues/transaction-sync.queue.js';
import { transactionSyncService } from '../../integrations/banking/services/transactionSync.service.js';

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

      console.log('req.body', req.body);
      const { providerKey, publicToken, metadata } = req.body;

      if (!providerKey || !publicToken) {
        return res
          .status(400)
          .json(
            errorResponse('Missing required fields: providerKey, publicToken'),
          );
      }

      const result = await connectAccountsService.connectBankAccounts({
        providerKey: providerKey,
        publicToken,
        metadata,
        companyId,
        userId,
      });

      console.log('Result:', result);

      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error: any) {
      console.error('Error connecting bank accounts:', error);
      res.status(500).json(errorResponse('Internal server error'));
    }
  }

  // TODO: Remove this... add update bank account function to banks.model.ts, then we can build a think wrapper round that for this if needed

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

      // const result = await bankingService.classifyBankAccount({
      //   accountId,
      //   companyId,
      //   userId,
      //   businessOrPersonal,
      // });
      const result = { success: false, note: '' };

      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error: any) {
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
      const userId = String(req.user?.id);
      const companyId = String(req.user?.currentCompanyId);
      const { credentialId } = req.body;

      if (!userId || !companyId) {
        return res
          .status(400)
          .json(errorResponse('Missing user or company ID'));
      }

      if (!credentialId) {
        return res.status(400).json(errorResponse('Missing credentialId'));
      }

      // Queue sync job
      const job = await transactionSyncQueue.add(
        'sync-transactions',
        {
          credentialId,
          syncType: 'manual',
          companyId,
          userId,
        },
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        },
      );

      res.json(
        successResponse('Transaction sync queued successfully', {
          jobId: job.id,
        }),
      );
    } catch (error: any) {
      console.error('Error queuing transaction sync:', error);
      res.status(500).json(errorResponse('Failed to queue transaction sync'));
    }
  }

  /**
   * Set transaction sync start date
   * POST /api/banking/set-sync-date
   */
  async setTransactionSyncDate(req: AuthRequest, res: Response) {
    try {
      const userId = String(req.user?.id);
      const companyId = String(req.user?.currentCompanyId);
      const { credentialId, fromDate } = req.body;

      if (!userId || !companyId) {
        return res
          .status(400)
          .json(errorResponse('Missing user or company ID'));
      }

      if (!credentialId) {
        return res.status(400).json(errorResponse('Missing credentialId'));
      }

      if (!fromDate) {
        return res.status(400).json(errorResponse('Missing fromDate'));
      }

      // Validate date format
      const date = new Date(fromDate);
      if (isNaN(date.getTime())) {
        return res.status(400).json(errorResponse('Invalid date format'));
      }

      // Check if date is not too far in the past (limit to 2 years)
      const twoYearsAgo = new Date();
      twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

      if (date < twoYearsAgo) {
        return res
          .status(400)
          .json(errorResponse('Date cannot be more than 2 years in the past'));
      }

      // Set the sync date
      await transactionSyncService.setTransactionSyncDate(credentialId, date);

      res.json(
        successResponse('Transaction sync date updated successfully', {
          credentialId,
          fromDate: date.toISOString(),
        }),
      );
    } catch (error: any) {
      console.error('Error setting transaction sync date:', error);
      res
        .status(500)
        .json(errorResponse('Failed to set transaction sync date'));
    }
  }

  /**
   * Get transaction sync status for a credential
   * GET /api/banking/sync-status/:credentialId
   */
  async getTransactionSyncStatus(req: AuthRequest, res: Response) {
    try {
      const userId = String(req.user?.id);
      const companyId = String(req.user?.currentCompanyId);
      const { credentialId } = req.params;

      if (!userId || !companyId) {
        return res
          .status(400)
          .json(errorResponse('Missing user or company ID'));
      }

      if (!credentialId) {
        return res.status(400).json(errorResponse('Missing credentialId'));
      }

      // Get credential details (this method would need to be added to TransactionSyncService)
      const credential =
        await transactionSyncService['getCredential'](credentialId);

      if (!credential) {
        return res.status(404).json(errorResponse('Credential not found'));
      }

      if (credential.company_id !== companyId) {
        return res.status(403).json(errorResponse('Access denied'));
      }

      res.json(
        successResponse('Transaction sync status retrieved', {
          credentialId,
          initialSyncCompleted: credential.initial_sync_completed,
          lastSyncAt: credential.last_transactions_sync_at,
          transactionsFromDate: credential.transactions_from_date,
          status: credential.status,
        }),
      );
    } catch (error: any) {
      console.error('Error getting transaction sync status:', error);
      res
        .status(500)
        .json(errorResponse('Failed to get transaction sync status'));
    }
  }
}

export const createCredential = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    // TODO: Update this to use new bankAccountCredentials.model.ts structure
    res
      .status(501)
      .json(
        errorResponse(
          'createCredential endpoint needs updating for new architecture',
        ),
      );
  } catch (error) {
    res.status(500).json(errorResponse('Internal server error', error));
  }
};
