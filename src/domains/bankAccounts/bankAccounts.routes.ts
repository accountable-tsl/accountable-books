import express from "express";
import { checkCompanyId } from "../../core/middlewares/companies.middleware";
import { createBankAccountController } from "./bankAccounts.controller";

const router = express.Router({ mergeParams: true });

router.post("/", checkCompanyId, createBankAccountController);

export default router;
