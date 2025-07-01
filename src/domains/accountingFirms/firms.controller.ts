import { Request, Response } from "express";
import { checkSlug, getSlugs } from "./firms.model";
import { errorResponse } from "../../shared/utils/response.utils";

export const checkSlugController = async (req: Request, res: Response) => {
  const { slug } = req.query;
  const companyId = req.company?.id || req.query.companyId;

  if (!slug || !companyId) {
    return res
      .status(400)
      .json(errorResponse("Slug and company ID are required"));
  }

  try {
    const result = await checkSlug({ slug: String(slug), companyId });
    console.log(`Checking slug: ${slug} for company: ${companyId}`, result);
    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    res.status(500).json(errorResponse("Internal server error"));
  }
};

export const getAllSlugs = async (req: Request, res: Response) => {
  try {
    const result = await getSlugs();
    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    res.status(500).json(errorResponse("Internal server error"));
  }
};
