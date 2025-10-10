import { type Request, type Response } from 'express';
import { errorResponse } from '../../shared/utils/response.utils.js';
import { checkEmail } from './email.model.js';
import { knexClient } from '../../db/knexClient.js';

export async function checkEmailController(req: Request, res: Response) {
  try {
    const { email, purpose } = req.body;
    const result = await checkEmail(knexClient, email, purpose);

    if (result.success) {
      return res.status(200).json(result);
    } else {
      return res.status(409).json(result);
    }
  } catch (error) {
    return res
      .status(500)
      .json(errorResponse('An unexpected error occurred', error));
  }
}
