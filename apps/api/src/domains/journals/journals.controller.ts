import { type Response } from 'express';
import z from 'zod';

import { type AuthRequest } from '../../features/auth/auth.types.js';
import { errorResponse } from '../../shared/utils/response.utils.js';
import {
  copyJournal,
  getJournal,
  getJournalsByCursor,
  getJournalsByPage,
  postDraftJournal,
  postDraftJournalsBatch,
  postJournalRecord,
  reverseJournalRecord,
  updateDraftJournal,
  voidDraftJournal,
  voidDraftJournalsBatch,
} from './journals.model.js';
import {
  copyJournalBody,
  postDraftJournalsBatchBody,
  voidDraftJournalsBatchBody,
} from './journals.types.js';

export async function getJournalController(req: AuthRequest, res: Response) {
  try {
    const userId = String(req.user?.id);
    const companyId = String(req.params.companyId);
    const journalId = String(req.params.journalId);
    const includeLedgerTotals =
      String(req.query.includeLedgerTotals).toLowerCase() === 'true' ||
      String(req.query.includeLedgerTotals) === '1';
    const includeFiles =
      String(req.query.includeFiles).toLowerCase() === 'true' ||
      String(req.query.includeFiles) === '1';
    const includeDeleted =
      String(req.query.includeDeleted).toLowerCase() === 'true' ||
      String(req.query.includeDeleted) === '1';

    if (!userId || !companyId || !journalId) {
      return res.status(400).json(errorResponse('Bad Request'));
    }

    const result = await getJournal({
      journalId,
      companyId,
      includeLedgerTotals,
      includeFiles,
      includeDeleted,
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

export async function updateDraftJournalController(
  req: AuthRequest,
  res: Response,
) {
  try {
    const userId = String(req.user?.id);
    const companyId = String(req.params.companyId);
    const journalBatchId = String(req.params.journalId);
    const data = req.body || {};

    if (!userId || !companyId || !journalBatchId) {
      return res.status(400).json(errorResponse('Bad Request'));
    }

    const result = await updateDraftJournal({
      journalBatchId,
      companyId,
      userId,
      data,
    });

    return result.success
      ? res.status(200).json(result)
      : res.status(400).json(result);
  } catch (error: unknown) {
    return res.status(500).json(errorResponse('An unexpected error occurred'));
  }
}

export async function postDraftJournalController(
  req: AuthRequest,
  res: Response,
) {
  try {
    const userId = String(req.user?.id);
    const companyId = String(req.params.companyId);
    const journalBatchId = String(req.params.journalId);

    if (!userId || !companyId || !journalBatchId) {
      return res.status(400).json(errorResponse('Bad Request'));
    }

    const result = await postDraftJournal({
      journalBatchId,
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

export async function postDraftJournalsBatchController(
  req: AuthRequest,
  res: Response,
) {
  try {
    const userId = String(req.user?.id);
    const companyId = String(req.params.companyId);

    if (!userId || !companyId) {
      return res.status(400).json(errorResponse('Bad Request'));
    }

    const parsed = postDraftJournalsBatchBody.safeParse(req.body ?? {});

    if (!parsed.success) {
      return res.status(400).json(
        errorResponse('Invalid input', {
          errors: z.flattenError(parsed.error),
        }),
      );
    }

    const result = await postDraftJournalsBatch({
      companyId,
      userId,
      journalIds: parsed.data.journalIds,
      mode: parsed.data.mode,
    });

    return result.success
      ? res.status(200).json(result)
      : res.status(400).json(result);
  } catch (error: unknown) {
    return res.status(500).json(errorResponse('An unexpected error occurred'));
  }
}

export async function voidDraftJournalsBatchController(
  req: AuthRequest,
  res: Response,
) {
  try {
    const userId = String(req.user?.id);
    const companyId = String(req.params.companyId);

    if (!userId || !companyId) {
      return res.status(400).json(errorResponse('Bad Request'));
    }

    const parsed = voidDraftJournalsBatchBody.safeParse(req.body ?? {});

    if (!parsed.success) {
      return res.status(400).json(
        errorResponse('Invalid input', {
          errors: z.flattenError(parsed.error),
        }),
      );
    }

    const result = await voidDraftJournalsBatch({
      companyId,
      userId,
      journalIds: parsed.data.journalIds,
      voidReason: parsed.data.voidReason,
      mode: parsed.data.mode,
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

export async function copyJournalController(req: AuthRequest, res: Response) {
  try {
    const userId = String(req.user?.id);
    const companyId = String(req.params.companyId);
    const sourceJournalBatchId = String(req.params.journalId);

    if (!userId || !companyId || !sourceJournalBatchId) {
      return res.status(400).json(errorResponse('Bad Request'));
    }

    const parsed = copyJournalBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json(
        errorResponse('Invalid input', {
          errors: z.flattenError(parsed.error),
        }),
      );
    }

    const result = await copyJournal({
      sourceJournalBatchId,
      companyId,
      userId,
      includeFiles: parsed.data.includeFiles,
    });

    return result.success
      ? res.status(200).json(result)
      : res.status(400).json(result);
  } catch (error: unknown) {
    return res.status(500).json(errorResponse('An unexpected error occurred'));
  }
}

export async function voidDraftJournalController(
  req: AuthRequest,
  res: Response,
) {
  try {
    const userId = String(req.user?.id);
    const companyId = String(req.params.companyId);
    const journalBatchId = String(req.params.journalId);
    const { voidReason } = req.body || {};

    if (!userId || !companyId || !journalBatchId) {
      return res.status(400).json(errorResponse('Bad Request'));
    }

    const result = await voidDraftJournal({
      journalBatchId,
      companyId,
      userId,
      voidReason,
    });

    return result.success
      ? res.status(200).json(result)
      : res.status(400).json(result);
  } catch (error: unknown) {
    return res.status(500).json(errorResponse('An unexpected error occurred'));
  }
}
