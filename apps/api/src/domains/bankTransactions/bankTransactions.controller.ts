import { type Response } from 'express';
import type { AuthRequest } from '../../features/auth/auth.types.js';
import { errorResponse } from '../../shared/utils/response.utils.js';
import {
  addNewBankTransactions,
  deleteBankTransactions,
} from './bankTransactions.model.js';

export async function handleTransactionImport(req: AuthRequest, res: Response) {
  const companyId = String(req.company?.id || req.params.companyId);
  const userId = String(req.user?.id || req.body.userId);

  if (!companyId || !userId) {
    return res.status(400).json(errorResponse('Unauthorized'));
  }

  try {
    const response = await addNewBankTransactions({
      companyId,
      data: req.body,
      userId,
    });

    return response.success
      ? res.status(200).json(response)
      : res.status(400).json(response);
  } catch (error: unknown) {
    return res.status(500).json(errorResponse('An unexpected error occurred'));
  }
}

export async function handleTransactionDeletion(
  req: AuthRequest,
  res: Response,
) {
  const companyId = String(req.company?.id || req.params.companyId);
  const userId = String(req.user?.id || req.body.userId);

  if (!companyId || !userId) {
    return res.status(400).json(errorResponse('Unauthorized'));
  }

  try {
    const response = await deleteBankTransactions({
      companyId,
      userId,
      input: req.body,
    });

    return response.success
      ? res.status(200).json(response)
      : res.status(400).json(response);
  } catch (error) {
    return res.status(500).json(errorResponse('Failed to delete transactions'));
  }
}
