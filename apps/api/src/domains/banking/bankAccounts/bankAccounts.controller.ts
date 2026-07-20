import type { Response } from 'express';
import {
  resolveReplacementUnmatchedReviewInputSchema,
  selectBankHistoryImportInputSchema,
} from '@accountable-books/contracts/schema';
import z from 'zod';

import { knexClient } from '../../../db/knexClient.js';
import { getCompanyUUID } from '../../../shared/utils/random.utils.js';
import { errorResponse } from '../../../shared/utils/response.utils.js';
import {
  acknowledgeBankTransactionRemovedReview,
  acknowledgeBankTransactionSupersededReview,
  resolveReplacementUnmatchedReview,
} from '../bank-exception-review/bank-exception-review.service.js';
import { promoteBankTransactionHistory } from '../bank-transaction-history/history-promotion.service.js';
import {
  createManualBankAccount,
  getBankAccountsWithDetails,
  getMinimalBankAccountDetails,
  updateBankAccounts,
} from './bankAccounts.model.js';
import { updateBankAccount } from './bankAccounts.types.js';

import type { AuthRequest } from '../../../features/auth/auth.types.js';

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
    const companyId = String(req.params.companyId);
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
  const companyId = String(req.params.companyId);
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

export async function selectBankHistoryImportController(
  req: AuthRequest,
  res: Response,
) {
  try {
    const companyId = String(req.params.companyId);
    const bankAccountId = String(req.params.bankAccountId);
    const userId = String(req.user?.id);

    if (!companyId || !bankAccountId || !userId) {
      return res.status(400).json(errorResponse('Unauthorized'));
    }

    const parsed = selectBankHistoryImportInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json(errorResponse('Invalid input', z.treeifyError(parsed.error)));
    }

    const companyUUID = await getCompanyUUID(companyId);
    if (!companyUUID) {
      return res.status(400).json(errorResponse('Invalid company ID'));
    }

    const feed = await knexClient('bank_account_feeds')
      .where({ bank_account_id: bankAccountId, company_id: companyUUID })
      .whereNull('revoked_at')
      .first<{ id: string }>('id');
    if (!feed) {
      return res
        .status(404)
        .json(errorResponse('Active bank account feed not found'));
    }

    const result = await promoteBankTransactionHistory({
      companyId: companyUUID,
      bankAccountId,
      feedId: feed.id,
      fromDate: parsed.data.fromDate,
      userId,
    });

    return result.success
      ? res.status(200).json(result)
      : res.status(400).json(result);
  } catch (error: unknown) {
    return res.status(500).json(errorResponse('An unexpected error occurred'));
  }
}

export async function resolveBankTransactionSupersededReviewController(
  req: AuthRequest,
  res: Response,
) {
  try {
    const companyId = String(req.params.companyId);
    const bankAccountId = String(req.params.bankAccountId);
    const bankTransactionId = String(req.params.bankTransactionId);
    const userId = String(req.user?.id);

    if (!companyId || !bankAccountId || !bankTransactionId || !userId) {
      return res.status(400).json(errorResponse('Unauthorized'));
    }

    const companyUUID = await getCompanyUUID(companyId);
    if (!companyUUID) {
      return res.status(400).json(errorResponse('Invalid company ID'));
    }

    const result = await knexClient.transaction((trx) =>
      acknowledgeBankTransactionSupersededReview({
        companyId: companyUUID,
        bankAccountId,
        bankTransactionId,
        actorUserId: userId,
        trx,
      }),
    );

    return result.success
      ? res.status(200).json(result)
      : res.status(400).json(result);
  } catch {
    return res.status(500).json(errorResponse('An unexpected error occurred'));
  }
}

export async function resolveBankTransactionRemovedReviewController(
  req: AuthRequest,
  res: Response,
) {
  try {
    const companyId = String(req.params.companyId);
    const bankAccountId = String(req.params.bankAccountId);
    const bankTransactionId = String(req.params.bankTransactionId);
    const userId = String(req.user?.id);

    if (!companyId || !bankAccountId || !bankTransactionId || !userId) {
      return res.status(400).json(errorResponse('Unauthorized'));
    }

    const companyUUID = await getCompanyUUID(companyId);
    if (!companyUUID) {
      return res.status(400).json(errorResponse('Invalid company ID'));
    }

    const result = await knexClient.transaction((trx) =>
      acknowledgeBankTransactionRemovedReview({
        companyId: companyUUID,
        bankAccountId,
        bankTransactionId,
        actorUserId: userId,
        trx,
      }),
    );

    return result.success
      ? res.status(200).json(result)
      : res.status(400).json(result);
  } catch {
    return res.status(500).json(errorResponse('An unexpected error occurred'));
  }
}

export async function resolveReplacementUnmatchedReviewController(
  req: AuthRequest,
  res: Response,
) {
  try {
    const companyId = String(req.params.companyId);
    const bankAccountId = String(req.params.bankAccountId);
    const bankTransactionId = String(req.params.bankTransactionId);
    const userId = String(req.user?.id);

    if (!companyId || !bankAccountId || !bankTransactionId || !userId) {
      return res.status(400).json(errorResponse('Unauthorized'));
    }

    const parsed = resolveReplacementUnmatchedReviewInputSchema.safeParse(
      req.body,
    );
    if (!parsed.success) {
      return res
        .status(400)
        .json(errorResponse('Invalid input', z.treeifyError(parsed.error)));
    }

    const companyUUID = await getCompanyUUID(companyId);
    if (!companyUUID) {
      return res.status(400).json(errorResponse('Invalid company ID'));
    }

    const result = await knexClient.transaction((trx) =>
      resolveReplacementUnmatchedReview({
        companyId: companyUUID,
        bankAccountId,
        bankTransactionId,
        decision: parsed.data.decision,
        actorUserId: userId,
        trx,
      }),
    );

    return result.success
      ? res.status(200).json(result)
      : res.status(400).json(result);
  } catch {
    return res.status(500).json(errorResponse('An unexpected error occurred'));
  }
}
