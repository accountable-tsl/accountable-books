import { type Request, type Response } from 'express';
import {
  checkSlugAvailability,
  checkSlugForCompany,
  getCompanySlug,
  getSlugs,
} from './firms.model.js';
import { errorResponse } from '../../shared/utils/response.utils.js';

export const checkSlugController = async (req: Request, res: Response) => {
  const slug = String(req.query.slug);

  if (!slug) {
    return res.status(400).json(errorResponse('Slug and company ID are required'));
  }

  try {
    const result = await checkSlugAvailability(slug);
    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    res.status(500).json(errorResponse('Internal server error'));
  }
};

export const getCompanySlugController = async (req: Request, res: Response) => {
  try {
    const { companyId } = req.params;

    if (!companyId) return res.status(400).json(errorResponse('Company ID is required'));

    const result = await getCompanySlug(companyId);

    return res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    return res.status(500).json(errorResponse('Internal server error'));
  }
};

/**
 * Check slug availability for a specific company (handles current slug case)
 * GET /api/:companyId/slugs/check?slug=example-slug
 */
export const checkSlugForCompanyController = async (req: Request, res: Response) => {
  try {
    const { companyId } = req.params;
    const { slug } = req.query;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        error: 'Company ID is required',
      });
    }

    if (!slug || typeof slug !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Slug parameter is required and must be a string',
      });
    }

    const result = await checkSlugForCompany({ slug, companyId });

    const statusCode = result.success ? 200 : 400;
    return res.status(statusCode).json(result);
  } catch (error) {
    return res.status(500).json(errorResponse('Internal server error'));
  }
};
