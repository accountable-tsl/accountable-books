import { type Response } from 'express';

import { errorResponse } from '../../../shared/utils/response.utils.js';
import { getBankFeedProviders } from './bankFeedProviders.model.js';

import type { AuthRequest } from '../../../features/auth/auth.types.js';
import type { BankProviderKey } from './bankFeedProviders.types.js';

export async function getBankFeedProvidersController(
  req: AuthRequest,
  res: Response,
) {
  try {
    const providerIds = req.query.providerIds
      ? String(req.query.providerIds).split(',').filter(Boolean)
      : undefined;

    const providerKeys = req.query.providerKeys
      ? (String(req.query.providerKeys)
          .split(',')
          .filter(Boolean) as BankProviderKey[])
      : undefined;

    const response = await getBankFeedProviders({
      providerIds,
      providerKeys,
    });

    return response.success
      ? res.status(200).json(response)
      : res.status(400).json(response);
  } catch (error: unknown) {
    return res.status(500).json(errorResponse('An unexpected error occurred'));
  }
}
