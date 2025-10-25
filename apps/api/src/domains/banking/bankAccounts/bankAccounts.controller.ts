import type { Response } from 'express';
import type { AuthRequest } from '../../../features/auth/auth.types.js';
import { errorResponse } from '../../../shared/utils/response.utils.js';
import {
  createManualBankAccount,
  getBankAccountsWithDetails,
  getMinimalBankAccountDetails,
  updateBankAccounts,
} from './bankAccounts.model.js';
import { updateBankAccount } from './bankAccounts.types.js';
import z from 'zod';

export async function createBankAccountController(
  req: AuthRequest,
  res: Response,
) {
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
    console.log(JSON.stringify(response));
    return response.success
      ? res.status(200).json(response)
      : res.status(400).json(response);
  } catch (error: unknown) {
    return res.status(500).json(errorResponse('An unexpected error occurred'));
  }
}

export async function getBankAccountsForCompany(
  req: AuthRequest,
  res: Response,
) {
  try {
    const companyId = req.params.companyId;
    const response = await getBankAccountsWithDetails(companyId);
    return response.success
      ? res.status(200).json(response)
      : res.status(400).json(response);
  } catch (error: unknown) {
    return res.status(500).json(errorResponse('An unexpected error occurred'));
  }
}

export async function updateBankAccountsController(
  req: AuthRequest,
  res: Response,
) {
  const companyId = String(req.params.companyId);
  const userId = String(req.user?.id);
  const payload = Array.isArray(req.body) ? req.body : [req.body];
  const v = updateBankAccount.array().safeParse(payload);
  if (!v.success) {
    return res
      .status(400)
      .json(errorResponse('Invalid input', z.treeifyError(v.error)));
  }
  const { data } = v;

  if (!companyId || !userId) {
    return res.status(400).json(errorResponse('Bad Request'));
  }

  try {
    const result = await updateBankAccounts({
      companyId,
      params: data,
      userId,
    });
    return result.success
      ? res.status(200).json(result)
      : res.status(400).json(result);
  } catch (error: unknown) {
    return res.status(500).json(errorResponse('An unexpected error occurred'));
  }
}

export async function getBankAccountsMinimal(req: AuthRequest, res: Response) {
  const companyId = req.params.companyId;
  const bankAccountIds = req.query.bankAccountIds;
  const idsArray = Array.isArray(bankAccountIds)
    ? bankAccountIds.filter((id): id is string => typeof id === 'string')
    : typeof bankAccountIds === 'string'
      ? [bankAccountIds]
      : undefined;

  try {
    const response = await getMinimalBankAccountDetails({
      companyId,
      bankAccountIds: idsArray,
    });
    console.log({ response });
    return response.success
      ? res.status(200).json(response)
      : res.status(400).json(response);
  } catch (error) {
    return res.status(500).json(errorResponse('An unexpected error occurred'));
  }
}
