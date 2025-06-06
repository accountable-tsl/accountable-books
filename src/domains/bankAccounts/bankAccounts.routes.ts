import express from "express";
import { checkCompanyId } from "../../core/middlewares/companies.middleware";
import {
  createBankAccountController,
  getBankAccountsForCompany,
} from "./bankAccounts.controller";

const router = express.Router({ mergeParams: true });

router.post("/", checkCompanyId, createBankAccountController);
router.get("/", checkCompanyId, getBankAccountsForCompany);

export default router;
