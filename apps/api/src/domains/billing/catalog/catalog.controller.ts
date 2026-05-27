import { type Request, type Response } from 'express';

import { errorResponse } from '../../../shared/utils/response.utils.js';
import { billingCatalogQuerySchema } from './catalog.query.js';
import { getBillingCatalog } from './catalog.service.js';

export async function getCatalog(req: Request, res: Response) {
  try {
    const parsedQuery = billingCatalogQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      return res
        .status(400)
        .json(
          errorResponse(
            'Invalid billing catalog query parameters',
            parsedQuery.error.flatten(),
          ),
        );
    }

    const { currencyCode, at: atRaw } = parsedQuery.data;
    const at = atRaw ? new Date(atRaw) : undefined;

    const result = await getBillingCatalog({ currencyCode, at });

    if (!result.success) {
      return res.status(500).json(result);
    }

    return res.status(200).json(result);
  } catch (error) {
    return res
      .status(500)
      .json(errorResponse('An unexpected error occurred', error));
  }
}
