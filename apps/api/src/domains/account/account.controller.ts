import { type Response } from 'express';

import { errorResponse } from '../../shared/utils/response.utils.js';
import { getAccountClassificationMeta } from './account.model.js';

import type { AuthRequest } from '../../features/auth/auth.types.js';

export async function accountMetaController(req: AuthRequest, res: Response) {
  try {
    const result = await getAccountClassificationMeta();
    return res.status(result.success ? 200 : 400).json(result);
  } catch (error: unknown) {
    return res.status(500).json(errorResponse('Internal server error'));
  }
}
