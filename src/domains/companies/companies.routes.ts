import express from "express";
import { switchCompanyController } from "./companies.controller";
import { checkCompanyId } from "../../core/middlewares/companies.middleware";
import { csrfProtection } from "../../features/auth/auth.utils";
import { verifyAccessToken } from "../../features/auth/auth.middleware";

const router = express.Router({ mergeParams: true });

router.post(
  "/switch",
  csrfProtection,
  verifyAccessToken,
  checkCompanyId,
  switchCompanyController
);

export default router;
