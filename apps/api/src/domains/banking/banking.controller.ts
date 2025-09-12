import type { Request, Response } from 'express';
import { connectAccountsService } from '../../integrations/banking/services/connectAccounts.service.js';
import { errorResponse, successResponse } from '../../shared/utils/response.utils.js';
import type { AuthRequest } from '../../features/auth/auth.types.js';
import { providerRegistry } from '../../integrations/banking/providers/registry.js';
import { bankProviderKey } from './bankFeedProviders/bankFeedProviders.types.js';

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

      if (!provider || !bankProviderKey.options.includes(provider) || !userId || !companyId) {
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
        return res.status(400).json(errorResponse('Missing provider or company ID'));
      }

      // TODO: Implement getDecryptedToken when needed for transaction sync
      return res.status(501).json(errorResponse('Token decryption not implemented yet'));
    } catch (error: any) {
      console.error('Test connection failed:', error);
      res.status(500).json(errorResponse(`Connection test failed: ${error.message}`));
    }
  }
}

export const createCredential = async (req: Request, res: Response): Promise<void> => {
  try {
    // TODO: Update this to use new bankAccountCredentials.model.ts structure
    res
      .status(501)
      .json(errorResponse('createCredential endpoint needs updating for new architecture'));
  } catch (error) {
    res.status(500).json(errorResponse('Internal server error', error));
  }
};
