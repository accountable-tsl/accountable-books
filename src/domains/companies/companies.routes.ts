import express, { RequestHandler } from "express";
import {
  getCompaniesController,
  getCompanyController,
  switchCompanyController,
  updateCompanyController,
} from "./companies.controller";
import { checkCompanyId } from "../../core/middlewares/companies.middleware";
import { csrfProtection } from "../../features/auth/auth.utils";
import {
  verifyAccessToken,
} from "../../features/auth/auth.middleware";
import { basicLimiter } from "../../core/middlewares/rateLimiter.middleware";
import { isDev } from "../../config/env";

const router = express.Router({ mergeParams: true });

router.post(
  "/switch",
  verifyAccessToken,
  checkCompanyId,
  switchCompanyController
);

// router.get(
//   "/",
//   verifyAccessToken,
//   // requirePermission("companies:view"),
//   getCompaniesController
// );

router.get(
  "/:companyId",
  verifyAccessToken,
  checkCompanyId,
  getCompanyController
);

router.patch("/:companyId", checkCompanyId, updateCompanyController);

export default router;
