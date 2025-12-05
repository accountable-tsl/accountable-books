import { type Request, type Response } from 'express';

import { errorResponse } from '../../shared/utils/response.utils.js';
import { getCountries } from './countries.model.js';

export async function getCountryList(req: Request, res: Response) {
  try {
    const result = await getCountries();

    if (result.success) {
      return res.status(200).json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (error) {
    return res
      .status(500)
      .json(errorResponse('An unexpected error occurred', error));
  }
}
