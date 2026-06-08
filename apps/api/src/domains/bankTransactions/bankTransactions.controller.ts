import { type Response } from 'express';

import { errorResponse } from '../../shared/utils/response.utils.js';
import {
  addNewBankTransactions,
  deleteBankTransactions,
  reverseBankTransactionBatch,
} from './bankTransactions.model.js';

import type { AuthRequest } from '../../features/auth/auth.types.js';

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

export async function handleBatchReversal(req: AuthRequest, res: Response) {
  const companyId = String(req.company?.id || req.params.companyId);
  const userId = String(req.user?.id || req.body.userId);
  const batchId = String(req.params.batchId);

  if (!companyId || !userId || !batchId) {
    return res.status(400).json(errorResponse('Unauthorized'));
  }

  try {
    const response = await reverseBankTransactionBatch({
      companyId,
      userId,
      batchId,
      input: req.body,
    });

    return response.success
      ? res.status(200).json(response)
      : res.status(400).json(response);
  } catch (error) {
    return res
      .status(500)
      .json(errorResponse('Failed to reverse transaction batch'));
  }
}
