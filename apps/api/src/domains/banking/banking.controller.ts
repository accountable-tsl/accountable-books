import type { Request, Response } from 'express';
import { connectAccountsService } from '../../integrations/banking/services/connectAccounts.service.js';
import { errorResponse, successResponse } from 'src/shared/utils/response.utils.js';
import { createCompanyBankCredential, getDecryptedToken } from './banking.model.js';
import type { NewCompanyBankCredentialInput } from './banking.types.js';
import type { AuthRequest } from 'src/features/auth/auth.types.js';
import { providerRegistry } from '../../integrations/banking/providers/registry.js';
import type { BankProviderKey } from 'src/domains/bankFeedProviders/bankFeedProviders.types.js';

export class BankingController {
  async connectBankAccounts(req: AuthRequest, res: Response) {
    try {
      const userId = String(req.user?.id);
      const companyId = String(req.body.companyId);

      if (!userId || !companyId) {
        return res.status(400).json(errorResponse('Missing user or company ID'));
      }

      console.log('req.body', req.body);
      const { providerKey, publicToken, metadata } = req.body;

      if (!providerKey || !publicToken) {
        return res
          .status(400)
          .json(errorResponse('Missing required fields: providerKey, publicToken'));
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
        return res.status(400).json(errorResponse('Missing required parameters'));
      }

      if (!businessOrPersonal || !['business', 'personal'].includes(businessOrPersonal)) {
        return res
          .status(400)
          .json(errorResponse('businessOrPersonal must be either "business" or "personal"'));
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

      if (!provider || !userId || !companyId) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: provider, userId, companyId',
        });
      }

      const providerInstance = await providerRegistry.get(provider);
      if (!providerInstance) {
        return res.status(400).json(errorResponse(`Unsupported provider: ${provider}`));
      }

      const token = await providerInstance.createLinkToken({
        userId,
        companyId,
      });

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
        return res.status(400).json(errorResponse('Missing provider or company ID'));
      }

      // Get and decrypt stored token
      const result = await getDecryptedToken({
        companyId,
        providerKey: provider,
      });

      if (!result.success || !result.token) {
        return res.status(404).json(errorResponse(`No active ${provider} connection found`));
      }

      // Test the token with the provider
      const providerInstance = await providerRegistry.get(provider as BankProviderKey);
      if (!providerInstance) {
        return res.status(400).json(errorResponse('Provider not supported'));
      }

      // For Plaid, test by fetching accounts
      if (provider === 'plaid') {
        const { PlaidApi, Configuration, PlaidEnvironments } = await import('plaid');
        const { ENV } = await import('src/config/env.js');

        const configuration = new Configuration({
          basePath: PlaidEnvironments[ENV.PLAID_ENV!],
          baseOptions: {
            headers: {
              'PLAID-CLIENT-ID': ENV.PLAID_CLIENT_ID,
              'PLAID-SECRET': ENV.PLAID_SECRET,
            },
          },
        });

        const client = new PlaidApi(configuration);
        const accountsResponse = await client.accountsGet({
          access_token: result.token,
        });

        return res.json(
          successResponse('Connection verified', {
            connected: true,
            provider,
            accountCount: accountsResponse.data.accounts.length,
            accounts: accountsResponse.data.accounts.map((acc) => ({
              id: acc.account_id,
              name: acc.name,
              type: acc.type,
              subtype: acc.subtype,
            })),
          }),
        );
      }

      // For other providers, just return success if token exists
      res.json(
        successResponse('Connection verified', {
          connected: true,
          provider,
        }),
      );
    } catch (error: any) {
      console.error('Test connection failed:', error);
      res.status(500).json(errorResponse(`Connection test failed: ${error.message}`));
    }
  }
}

export const createCredential = async (req: Request, res: Response): Promise<void> => {
  try {
    const input: NewCompanyBankCredentialInput = req.body;
    const result = await createCompanyBankCredential(input);

    if (result.success) {
      res.status(201).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json(errorResponse('Internal server error', error));
  }
};
