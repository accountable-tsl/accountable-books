import type { Request, Response } from 'express';
import { bankingService } from '../../integrations/banking/index.js';
import { errorResponse, successResponse } from 'src/shared/utils/response.utils.js';
import { createCompanyBankCredential, getDecryptedToken } from './banking.model.js';
import type { NewCompanyBankCredentialInput } from './banking.types.js';
import type { AuthRequest } from 'src/features/auth/auth.types.js';
import { providerRegistry } from '../../integrations/banking/providers/registry.js';

export class BankingController {
  async createLinkToken(req: Request, res: Response) {
    try {
      const { provider, userId, companyId } = req.body;

      if (!provider || !userId || !companyId) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: provider, userId, companyId',
        });
      }

      const result = await bankingService.createLinkToken({
        provider,
        userId,
        companyId,
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

  async exchangeToken(req: AuthRequest, res: Response) {
    try {
      const userId = String(req.user?.id);
      if (!userId) {
        return res.status(400).json(errorResponse('Missing user ID'));
      }

      const { provider, publicToken, metadata, companyId } = req.body;

      if (!provider || !publicToken) {
        return res
          .status(400)
          .json(errorResponse('Missing required fields: provider, publicToken'));
      }

      const result = await bankingService.exchangeToken({
        provider,
        publicToken,
        metadata,
        companyId,
        userId,
      });

      if (result.success) {
        res.json(result);
      } else {
        res.status(result.data?.error?.retryable ? 429 : 400).json(result);
      }
    } catch (error: any) {
      console.error('Error exchanging token:', error);
      res.status(500).json(errorResponse('Internal server error'));
    }
  }

  async getSupportedCountries(req: Request, res: Response) {
    try {
      const countries = await bankingService.getSupportedCountries();
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
      const providerInstance = await providerRegistry.get(provider);
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
