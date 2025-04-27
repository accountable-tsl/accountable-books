import express, { RequestHandler } from "express";
import {
  getCompaniesController,
  getCompanyController,
  switchCompanyController,
} from "./companies.controller";
import { checkCompanyId } from "../../core/middlewares/companies.middleware";
import { csrfProtection } from "../../features/auth/auth.utils";
import {
  requirePermission,
  verifyAccessToken,
} from "../../features/auth/auth.middleware";
import { basicLimiter } from "../../core/middlewares/rateLimiter.middleware";
import { isDev } from "../../config/env";

const limiter: RequestHandler = isDev
  ? (req, res, next) => next()
  : basicLimiter;

const router = express.Router({ mergeParams: true });

router.post(
  "/switch",
  csrfProtection,
  verifyAccessToken,
  checkCompanyId,
  switchCompanyController
);

router.get(
  "/",
  limiter,
  verifyAccessToken,
  // requirePermission("companies:view"),
  getCompaniesController
);

router.get(
  "/:companyId",
  limiter,
  verifyAccessToken,
  checkCompanyId,
  getCompanyController
);

export default router;
