import type { Response } from 'express';
import z from 'zod';

import { errorResponse, successResponse } from '../../../shared/utils/index.js';
import { getPeriodStatusForDate } from './fiscal-calendar.service.js';
import { periodStatusQuery } from './fiscal-calendar.types.js';

import type { AuthRequest } from '../../../features/auth/auth.types.js';

export async function getPeriodStatusController(
  req: AuthRequest,
  res: Response,
) {
  try {
    const companyId = String(req.params.companyId);

    const parsed = periodStatusQuery.safeParse(req.query ?? {});
    if (!parsed.success) {
      return res.status(400).json(
        errorResponse('Invalid input', {
          errors: z.flattenError(parsed.error),
        }),
      );
    }

    const result = await getPeriodStatusForDate({
      companyId,
      date: parsed.data.date,
    });

    return res
      .status(200)
      .json(successResponse('Period status retrieved', result));
  } catch (error: unknown) {
    return res.status(500).json(
      errorResponse('Failed to get period status', {
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}
