import type { Response } from 'express';
import type { AuthRequest } from '../../../features/auth/auth.types.js';
import { errorResponse } from '../../../shared/utils/response.utils.js';
import { createManualBankAccount, getBankAccountsWithDetails } from './bankAccounts.model.js';

export async function createBankAccountController(req: AuthRequest, res: Response) {
  try {
    const companyId = String(req.params.companyId || req.body.companyId);
    const userId = String(req.user?.id || req.body.userId);

    if (!companyId || !userId) {
      return res.status(400).json(errorResponse('Unauthorized'));
    }

    const response = await createManualBankAccount({
      params: req.body,
      userId: userId,
      companyId,
    });
    return response.success ? res.status(200).json(response) : res.status(400).json(response);
  } catch (error: unknown) {
    return res.status(500).json(errorResponse('An unexpected error occurred'));
  }
}

export async function getBankAccountsForCompany(req: AuthRequest, res: Response) {
  try {
    const companyId = req.company?.id || req.params.companyId;
    const response = await getBankAccountsWithDetails(companyId);
    return response.success ? res.status(200).json(response) : res.status(400).json(response);
  } catch (error: unknown) {
    return res.status(500).json(errorResponse('An unexpected error occurred'));
  }
}
