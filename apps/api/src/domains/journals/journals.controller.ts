import { type Response } from 'express';

import { type AuthRequest } from '../../features/auth/auth.types.js';
import { errorResponse } from '../../shared/utils/response.utils.js';
import {
  getJournal,
  getJournalsByCursor,
  getJournalsByPage,
  postJournalRecord,
  reverseJournalRecord,
} from './journals.model.js';

export async function getJournalController(req: AuthRequest, res: Response) {
  try {
    const userId = String(req.user?.id);
    const companyId = String(req.params.companyId);
    const journalId = String(req.params.journalId);
    const includeLedgerTotals =
      String(req.query.includeLedgerTotals).toLowerCase() === 'true' ||
      String(req.query.includeLedgerTotals) === '1';

    if (!userId || !companyId || !journalId) {
      return res.status(400).json(errorResponse('Bad Request'));
    }

    const result = await getJournal({
      journalId,
      companyId,
      includeLedgerTotals,
    });

    return result.success
      ? res.status(200).json(result)
      : res.status(400).json(result);
  } catch (error: unknown) {
    return res.status(500).json(errorResponse('An unexpected error occurred'));
  }
}

export async function getJournalsByPageController(
  req: AuthRequest,
  res: Response,
) {
  try {
    const userId = String(req.user?.id);
    const companyId = String(req.params.companyId);
    const queryData = req.body || {};

    if (!userId || !companyId) {
      return res.status(400).json(errorResponse('Bad Request'));
    }

    const result = await getJournalsByPage({
      userId,
      companyId,
      queryData,
    });

    return result.success
      ? res.status(200).json(result)
      : res.status(400).json(result);
  } catch (error: unknown) {
    return res.status(500).json(errorResponse('An unexpected error occurred'));
  }
}

export async function getJournalsByCursorController(
  req: AuthRequest,
  res: Response,
) {
  try {
    const userId = String(req.user?.id);
    const companyId = String(req.params.companyId);
    const queryData = req.body || {};

    if (!userId || !companyId) {
      return res.status(400).json(errorResponse('Bad Request'));
    }

    const result = await getJournalsByCursor({
      userId,
      companyId,
      queryData,
    });

    return result.success
      ? res.status(200).json(result)
      : res.status(400).json(result);
  } catch (error: unknown) {
    return res.status(500).json(errorResponse('An unexpected error occurred'));
  }
}

export async function postJournalController(req: AuthRequest, res: Response) {
  try {
    const userId = String(req.user?.id);
    const companyId = String(req.params.companyId);
    const data = req.body || {};

    if (!userId || !companyId) {
      return res.status(400).json(errorResponse('Bad Request'));
    }

    const result = await postJournalRecord({
      data,
      companyId,
      userId,
    });

    return result.success
      ? res.status(200).json(result)
      : res.status(400).json(result);
  } catch (error: unknown) {
    return res.status(500).json(errorResponse('An unexpected error occurred'));
  }
}

export async function reverseJournalController(
  req: AuthRequest,
  res: Response,
) {
  try {
    const userId = String(req.user?.id);
    const companyId = String(req.params.companyId);
    const journalBatchId = String(req.params.journalId);
    const { reversalReason, reversalDate } = req.body || {};

    if (!userId || !companyId || !journalBatchId) {
      return res.status(400).json(errorResponse('Bad Request'));
    }

    const parsedReversalDate =
      reversalDate != null ? new Date(reversalDate) : undefined;
    if (parsedReversalDate && Number.isNaN(parsedReversalDate.getTime())) {
      return res.status(400).json(errorResponse('Invalid reversal date'));
    }

    const result = await reverseJournalRecord({
      journalBatchId,
      companyId,
      userId,
      reversalReason,
      reversalDate: parsedReversalDate,
    });

    return result.success
      ? res.status(200).json(result)
      : res.status(400).json(result);
  } catch (error: unknown) {
    return res.status(500).json(errorResponse('An unexpected error occurred'));
  }
}

export async function voidJournalController(req: AuthRequest, res: Response) {
  return reverseJournalController(req, res);
}
