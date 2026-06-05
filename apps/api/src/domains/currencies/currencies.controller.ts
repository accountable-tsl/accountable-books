import { type Request, type Response } from 'express';

import {
  errorResponse,
  getHttpStatusFromErrorCode,
} from '../../shared/utils/response.utils.js';
import { getAllCurrencies } from './currencies.model.js';

export async function allCurrencies(req: Request, res: Response) {
  try {
    const result = await getAllCurrencies();

    if (result.success) return res.status(200).json(result);

    const status = getHttpStatusFromErrorCode(result.code);
    return res.status(status).json(result);
  } catch (error) {
    res.status(500).json(errorResponse('An unexpected error occurred', error));
  }
}
