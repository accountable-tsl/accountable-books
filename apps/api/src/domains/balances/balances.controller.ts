import type { Response } from 'express';
import z from 'zod';

import {
  errorResponse,
  successResponse,
} from '../../shared/utils/response.utils.js';
import {
  closeFiscalPeriod,
  getFiscalPeriods,
  reopenFiscalPeriod,
} from '../reporting/fiscal-calendar/fiscal-calendar.service.js';
import {
  getBankBalanceHistory,
  getCurrentBankBalance,
  getCurrentGLBalance,
  getGLBalanceHistory,
  getTrialBalance,
  recalculateAllBankBalances,
  recalculateAllGLBalances,
  recalculateBankBalance,
  recalculateGLBalance,
  refreshTrialBalance,
} from './balances.model.js';

import type { AuthRequest } from '../../features/auth/auth.types.js';

/**
 * Balance management controller
 * Handles manual balance recalculation and balance queries
 */

function getRequestCompanyId(req: AuthRequest): string {
  const companyId = req.companyContext?.uuid ?? req.company?.id;
  if (!companyId) {
    throw new Error('Authenticated company context is required');
  }
  return companyId;
}

const trialBalanceQuerySchema = z
  .object({
    fiscalYear: z.coerce.number().int().min(1900).max(9999).optional(),
    fiscalPeriod: z.coerce.number().int().min(1).max(12).optional(),
    periodNumber: z.coerce.number().int().min(1).max(12).optional(),
    periodType: z.enum(['monthly', 'quarterly', 'yearly']).optional(),
    includeZeroBalances: booleanParamSchema(true),
    includeFreshAccounts: booleanParamSchema(false),
    asOfDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    fromDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    toDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.fiscalPeriod !== undefined &&
      value.periodNumber !== undefined &&
      value.fiscalPeriod !== value.periodNumber
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'fiscalPeriod and periodNumber cannot conflict',
        path: ['periodNumber'],
      });
    }

    const periodNumber = value.periodNumber ?? value.fiscalPeriod;
    const hasDateRange =
      value.fromDate !== undefined || value.toDate !== undefined;
    const hasFiscalSelector =
      value.fiscalYear !== undefined ||
      periodNumber !== undefined ||
      value.asOfDate !== undefined ||
      value.periodType !== undefined;

    if (
      hasDateRange &&
      (value.fromDate === undefined || value.toDate === undefined)
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'fromDate and toDate are required together',
        path: ['fromDate'],
      });
    }

    if (
      value.fromDate !== undefined &&
      value.toDate !== undefined &&
      value.fromDate > value.toDate
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'fromDate must be on or before toDate',
        path: ['toDate'],
      });
    }

    if (hasDateRange && hasFiscalSelector) {
      ctx.addIssue({
        code: 'custom',
        message:
          'Use either fromDate/toDate or fiscal period selectors, not both',
        path: ['fromDate'],
      });
    }

    if (
      !hasDateRange &&
      ((value.fiscalYear === undefined && periodNumber !== undefined) ||
        (value.fiscalYear !== undefined && periodNumber === undefined))
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'fiscalYear and periodNumber are required together',
        path: ['fiscalYear'],
      });
    }

    const periodType = value.periodType ?? 'monthly';
    if (periodType === 'quarterly' && periodNumber && periodNumber > 4) {
      ctx.addIssue({
        code: 'custom',
        message: 'periodNumber must be between 1 and 4 for quarterly reports',
        path: ['periodNumber'],
      });
    }

    if (periodType === 'yearly' && periodNumber && periodNumber !== 1) {
      ctx.addIssue({
        code: 'custom',
        message: 'periodNumber must be 1 for yearly reports',
        path: ['periodNumber'],
      });
    }
  });

function booleanParamSchema(defaultValue: boolean) {
  return z
    .preprocess((value) => {
      if (value === undefined) return undefined;
      if (typeof value === 'boolean') return value;
      if (value === 'true') return true;
      if (value === 'false') return false;
      return value;
    }, z.boolean().optional())
    .transform((value) => value ?? defaultValue);
}

function parseTrialBalanceInput(req: AuthRequest) {
  return trialBalanceQuerySchema.safeParse({
    ...(req.query ?? {}),
    ...(req.body ?? {}),
  });
}

/**
 * Manually trigger GL balance recalculation for a specific COA
 */
export async function recalculateGLBalanceController(
  req: AuthRequest,
  res: Response,
) {
  try {
    const coaId = String(req.params.coaId);
    const companyId = getRequestCompanyId(req);
    const { recalcFrom, recalcTo } = req.body;

    const result = await recalculateGLBalance({
      companyId,
      coaId,
      recalcFrom: recalcFrom || '2020-01-01',
      recalcTo,
      triggeredBy: 'manual',
    });

    return result.success ? res.json(result) : res.status(400).json(result);
  } catch (error) {
    return res.status(500).json(
      errorResponse('Failed to queue GL balance recalculation', {
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
    );
  }
}

/**
 * Manually trigger bank balance recalculation for a specific bank account
 */
export async function recalculateBankBalanceController(
  req: AuthRequest,
  res: Response,
) {
  try {
    const companyId = getRequestCompanyId(req);
    const bankAccountId = String(req.params.bankAccountId);
    const { recalcFrom, recalcTo } = req.body;

    const result = await recalculateBankBalance({
      companyId,
      bankAccountId,
      recalcFrom: recalcFrom || '2020-01-01',
      recalcTo,
      triggeredBy: 'manual',
    });

    return result.success ? res.json(result) : res.status(400).json(result);
  } catch (error) {
    return res.status(500).json(
      errorResponse('Failed to queue bank balance recalculation', {
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
    );
  }
}

/**
 * Trigger recalculation for all GL accounts in the company
 */
export async function recalculateAllGLBalancesController(
  req: AuthRequest,
  res: Response,
) {
  try {
    const companyId = getRequestCompanyId(req);
    const { recalcFrom, recalcTo } = req.body;

    const result = await recalculateAllGLBalances({
      companyId,
      recalcFrom: recalcFrom || '2020-01-01',
      recalcTo,
      triggeredBy: 'manual',
    });

    return result.success ? res.json(result) : res.status(400).json(result);
  } catch (error) {
    return res
      .status(500)
      .json(
        errorResponse(
          'Failed to queue GL balance recalculation for all accounts',
          { error: error instanceof Error ? error.message : 'Unknown error' },
        ),
      );
  }
}

/**
 * Trigger recalculation for all bank accounts in the company
 */
export async function recalculateAllBankBalancesController(
  req: AuthRequest,
  res: Response,
) {
  try {
    const companyId = getRequestCompanyId(req);
    const { recalcFrom, recalcTo } = req.body;

    const result = await recalculateAllBankBalances({
      companyId,
      recalcFrom: recalcFrom || '2020-01-01',
      recalcTo,
      triggeredBy: 'manual',
    });

    return result.success ? res.json(result) : res.status(400).json(result);
  } catch (error) {
    return res
      .status(500)
      .json(
        errorResponse(
          'Failed to queue bank balance recalculation for all accounts',
          { error: error instanceof Error ? error.message : 'Unknown error' },
        ),
      );
  }
}

/**
 * Get current GL balance for a COA account
 */
export async function getCurrentGLBalanceController(
  req: AuthRequest,
  res: Response,
) {
  try {
    const companyId = getRequestCompanyId(req);
    const coaId = String(req.params.coaId);

    const result = await getCurrentGLBalance({
      companyId,
      coaId,
    });

    return result.success ? res.json(result) : res.status(404).json(result);
  } catch (error) {
    return res.status(500).json(
      errorResponse('Failed to retrieve GL balance', {
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
    );
  }
}

/**
 * Get current bank balance for a bank account
 */
export async function getCurrentBankBalanceController(
  req: AuthRequest,
  res: Response,
) {
  try {
    const companyId = getRequestCompanyId(req);
    const bankAccountId = String(req.params.bankAccountId);

    const result = await getCurrentBankBalance({
      companyId,
      bankAccountId,
    });

    return result.success ? res.json(result) : res.status(404).json(result);
  } catch (error) {
    return res.status(500).json(
      errorResponse('Failed to retrieve bank balance', {
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
    );
  }
}

/**
 * Get GL balance history for a COA account
 */
export async function getGLBalanceHistoryController(
  req: AuthRequest,
  res: Response,
) {
  try {
    const companyId = getRequestCompanyId(req);
    const coaId = String(req.params.coaId);
    const { fromDate, toDate, limit = 30 } = req.query;

    const result = await getGLBalanceHistory({
      companyId,
      coaId,
      fromDate: fromDate as string,
      toDate: toDate as string,
    });

    return result.success ? res.json(result) : res.status(400).json(result);
  } catch (error) {
    return res.status(500).json(
      errorResponse('Failed to retrieve GL balance history', {
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
    );
  }
}

/**
 * Get bank balance history for a bank account
 */
export async function getBankBalanceHistoryController(
  req: AuthRequest,
  res: Response,
) {
  try {
    const companyId = getRequestCompanyId(req);
    const bankAccountId = String(req.params.bankAccountId);
    const { fromDate, toDate, limit = 30 } = req.query;

    const result = await getBankBalanceHistory({
      companyId,
      bankAccountId,
      fromDate: fromDate as string,
      toDate: toDate as string,
    });

    return result.success ? res.json(result) : res.status(400).json(result);
  } catch (error) {
    return res.status(500).json(
      errorResponse('Failed to retrieve bank balance history', {
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
    );
  }
}

/**
 * Get trial balance for a specific fiscal period
 */
export async function getTrialBalanceController(
  req: AuthRequest,
  res: Response,
) {
  try {
    const companyId = getRequestCompanyId(req);
    const parsed = parseTrialBalanceInput(req);

    if (!parsed.success) {
      return res.status(400).json(
        errorResponse('Invalid trial balance query', {
          errors: z.flattenError(parsed.error),
        }),
      );
    }

    const periodNumber = parsed.data.periodNumber ?? parsed.data.fiscalPeriod;

    const result = await getTrialBalance({
      companyId,
      fiscalYear: parsed.data.fiscalYear,
      periodNumber,
      periodType: parsed.data.periodType ?? 'monthly',
      includeZeroBalances: parsed.data.includeZeroBalances,
      asOfDate: parsed.data.asOfDate,
      fromDate: parsed.data.fromDate,
      toDate: parsed.data.toDate,
    });

    return result.success ? res.json(result) : res.status(400).json(result);
  } catch (error) {
    return res.status(500).json(
      errorResponse('Failed to get trial balance', {
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
    );
  }
}

/**
 * Queue recalculation for stale or missing trial balance accounts.
 */
export async function refreshTrialBalanceController(
  req: AuthRequest,
  res: Response,
) {
  try {
    const companyId = getRequestCompanyId(req);
    const parsed = parseTrialBalanceInput(req);

    if (!parsed.success) {
      return res.status(400).json(
        errorResponse('Invalid trial balance refresh request', {
          errors: z.flattenError(parsed.error),
        }),
      );
    }

    const periodNumber = parsed.data.periodNumber ?? parsed.data.fiscalPeriod;

    const result = await refreshTrialBalance({
      companyId,
      fiscalYear: parsed.data.fiscalYear,
      periodNumber,
      periodType: parsed.data.periodType ?? 'monthly',
      asOfDate: parsed.data.asOfDate,
      fromDate: parsed.data.fromDate,
      toDate: parsed.data.toDate,
      includeFreshAccounts: parsed.data.includeFreshAccounts,
    });

    return result.success ? res.json(result) : res.status(400).json(result);
  } catch (error) {
    return res.status(500).json(
      errorResponse('Failed to refresh trial balance', {
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
    );
  }
}

/**
 * Get fiscal periods for a company
 */
export async function getFiscalPeriodsController(
  req: AuthRequest,
  res: Response,
) {
  try {
    const companyId = getRequestCompanyId(req);
    const { fiscalYear, periodType = 'monthly' } = req.query;

    const periods = await getFiscalPeriods(
      companyId,
      fiscalYear ? Number(fiscalYear) : undefined,
      periodType as 'monthly' | 'quarterly' | 'yearly',
    );

    return res.json(successResponse('Fiscal periods retrieved', periods));
  } catch (error) {
    return res.status(500).json(
      errorResponse('Failed to get fiscal periods', {
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
    );
  }
}

/**
 * Close a fiscal period
 */
export async function closeFiscalPeriodController(
  req: AuthRequest,
  res: Response,
) {
  try {
    const companyId = getRequestCompanyId(req);
    const { fiscalYear, fiscalPeriod, periodType = 'monthly' } = req.body;
    const { id: userId } = req.user!;

    if (!fiscalYear || !fiscalPeriod) {
      return res
        .status(400)
        .json(errorResponse('fiscalYear and fiscalPeriod are required', {}));
    }

    const result = await closeFiscalPeriod({
      companyId,
      userId,
      fiscalYear: Number(fiscalYear),
      periodNumber: Number(fiscalPeriod),
      periodType: periodType as 'monthly',
    });

    return result.success
      ? res.json(successResponse(result.message, { warnings: result.warnings }))
      : res
          .status(400)
          .json(errorResponse(result.message, { warnings: result.warnings }));
  } catch (error) {
    return res.status(500).json(
      errorResponse('Failed to close fiscal period', {
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
    );
  }
}

/**
 * Reopen a fiscal period
 */
export async function reopenFiscalPeriodController(
  req: AuthRequest,
  res: Response,
) {
  try {
    const companyId = getRequestCompanyId(req);
    const {
      fiscalYear,
      fiscalPeriod,
      periodType = 'monthly',
      reason,
    } = req.body;
    const { id: userId } = req.user!;

    if (!fiscalYear || !fiscalPeriod || !reason) {
      return res
        .status(400)
        .json(
          errorResponse(
            'fiscalYear, fiscalPeriod, and reason are required',
            {},
          ),
        );
    }

    const result = await reopenFiscalPeriod({
      companyId,
      userId,
      fiscalYear: Number(fiscalYear),
      periodNumber: Number(fiscalPeriod),
      reason,
      periodType: periodType as 'monthly',
    });

    return result.success
      ? res.json(successResponse(result.message, {}))
      : res.status(400).json(errorResponse(result.message, {}));
  } catch (error) {
    return res.status(500).json(
      errorResponse('Failed to reopen fiscal period', {
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
    );
  }
}
