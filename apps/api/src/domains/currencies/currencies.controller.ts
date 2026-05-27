import { type Request, type Response } from 'express';

import { errorResponse } from '../../shared/utils/response.utils.js';
import { getAllCurrencies } from './currencies.model.js';

export async function allCurrencies(req: Request, res: Response) {
  try {
    const result = await getAllCurrencies();

    if (result.success) {
      res.status(200).json(result);
    } else if (result.data?.length === 0) {
      return res.status(404).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json(errorResponse('An unexpected error occurred', error));
  }
}
