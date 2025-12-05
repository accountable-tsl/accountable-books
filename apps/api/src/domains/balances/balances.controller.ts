import type { Response } from 'express';

import type { AuthRequest } from '../../features/auth/auth.types.js';
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
} from './balances.model.js';

/**
 * Balance management controller
 * Handles manual balance recalculation and balance queries
 */

/**
 * Manually trigger GL balance recalculation for a specific COA
 */
export async function recalculateGLBalanceController(
  req: AuthRequest,
  res: Response,
) {
  try {
    const { coaId } = req.params;
    const companyId = req.company!.id;
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
    const { id: companyId } = req.company!;
    const { bankAccountId } = req.params;
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
    const companyId = req.company!.id;
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
    const companyId = req.company!.id;
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
    const companyId = req.company!.id;
    const { coaId } = req.params;

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
    const companyId = req.company!.id;
    const { bankAccountId } = req.params;

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
    const companyId = req.company!.id;
    const { coaId } = req.params;
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
    const companyId = req.company!.id;
    const { bankAccountId } = req.params;
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
    const companyId = req.company!.id;
    const { fiscalYear, fiscalPeriod, periodType = 'monthly' } = req.query;

    if (!fiscalYear || !fiscalPeriod) {
      return res
        .status(400)
        .json(errorResponse('fiscalYear and fiscalPeriod are required', {}));
    }

    const result = await getTrialBalance({
      companyId,
      fiscalYear: Number(fiscalYear),
      fiscalPeriod: Number(fiscalPeriod),
      periodType: periodType as 'monthly' | 'quarterly' | 'yearly',
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
 * Get fiscal periods for a company
 */
export async function getFiscalPeriodsController(
  req: AuthRequest,
  res: Response,
) {
  try {
    const companyId = req.company!.id;
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
    const companyId = req.company!.id;
    const { fiscalYear, fiscalPeriod, periodType = 'monthly' } = req.body;
    const { id: userId } = req.user!;

    if (!fiscalYear || !fiscalPeriod) {
      return res
        .status(400)
        .json(errorResponse('fiscalYear and fiscalPeriod are required', {}));
    }

    const result = await closeFiscalPeriod(
      companyId,
      Number(fiscalYear),
      Number(fiscalPeriod),
      userId,
      periodType as 'monthly',
    );

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
    const companyId = req.company!.id;
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

    const result = await reopenFiscalPeriod(
      companyId,
      Number(fiscalYear),
      Number(fiscalPeriod),
      userId,
      reason,
      periodType as 'monthly',
    );

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
