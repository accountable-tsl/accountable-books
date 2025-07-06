import express from "express";
import {
  checkSlugController,
  checkSlugForCompanyController,
  getCompanySlugController,
} from "./firms.controller";

const router = express.Router({ mergeParams: true });

// /api/accounting-firms/check-slug?slug=example-slug
router.get("/", checkSlugController);

// /api/accounting-firms/:companyId/slug
router.get("/:companyId/slug", getCompanySlugController);

// /api/accounting-firms/:companyId/slugs/check?slug=example-slug
router.get("/:companyId/slugs/check", checkSlugForCompanyController);

export default router;
