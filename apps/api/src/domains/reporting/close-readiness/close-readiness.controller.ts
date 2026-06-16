import type { Response } from 'express';
import { z } from 'zod';

import { errorResponse, successResponse } from '../../../shared/utils/index.js';
import {
  CLOSE_REVIEW_DECISION_KINDS,
  recordCloseReviewDecision,
} from './close-decisions.js';
import { closeReadinessFindingCode } from './close-readiness.types.js';
import { recomputePeriodSignals } from './signals/close-signals.recompute.js';
import { fiscalPeriodType } from '../fiscal-calendar/fiscal-calendar.types.js';

import type { AuthRequest } from '../../../features/auth/auth.types.js';

function getRequestCompanyId(req: AuthRequest): string {
  const companyId = req.companyContext?.uuid ?? req.company?.id;
  if (!companyId) {
    throw new Error('Authenticated company context is required');
  }
  return companyId;
}

const periodFields = {
  fiscalYear: z.coerce.number().int().min(1900).max(9999),
  periodNumber: z.coerce.number().int().min(1),
  periodType: fiscalPeriodType.optional(),
};

const recordDecisionBody = z.object({
  ...periodFields,
  findingCode: closeReadinessFindingCode,
  decision: z.enum(CLOSE_REVIEW_DECISION_KINDS),
  reason: z.string().trim().min(1),
  /** The factsHash the client saw; rejected if it is no longer current. */
  expectedFactsHash: z.string().min(1).optional(),
});

const recomputeBody = z.object(periodFields);

/**
 * Record an append-only decision (acknowledge / not applicable / dismiss) on a
 * close review rollup finding. The server recomputes the rollup identity from
 * current signals — the client never supplies the authoritative facts_hash.
 */
export async function recordCloseReviewDecisionController(
  req: AuthRequest,
  res: Response,
) {
  try {
    const companyId = getRequestCompanyId(req);
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json(errorResponse('Authentication required', {}));
    }

    const parsed = recordDecisionBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json(
        errorResponse('Invalid input', {
          errors: z.flattenError(parsed.error),
        }),
      );
    }

    const result = await recordCloseReviewDecision({
      companyId,
      decidedById: userId,
      ...parsed.data,
    });

    if (!result.ok) {
      if (result.reason === 'no_open_finding') {
        return res.status(404).json(errorResponse(result.message, {}));
      }
      return res.status(409).json(
        errorResponse(result.message, {
          currentFactsHash: result.currentFactsHash,
        }),
      );
    }

    return res
      .status(201)
      .json(successResponse('Close review decision recorded', result.decision));
  } catch (error: unknown) {
    return res.status(500).json(
      errorResponse('Failed to record close review decision', {
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}

/**
 * Manual "refresh checks": re-enqueue signal evaluation for the period's posted
 * transactions, on the still-open period, so fresh signals exist before the
 * close decision. This is the staleness backstop, placed where it matters.
 */
export async function recomputeCloseSignalsController(
  req: AuthRequest,
  res: Response,
) {
  try {
    const companyId = getRequestCompanyId(req);

    const parsed = recomputeBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json(
        errorResponse('Invalid input', {
          errors: z.flattenError(parsed.error),
        }),
      );
    }

    const result = await recomputePeriodSignals(companyId, parsed.data);

    return res
      .status(202)
      .json(successResponse('Close review signal recompute enqueued', result));
  } catch (error: unknown) {
    return res.status(500).json(
      errorResponse('Failed to recompute close review signals', {
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}
