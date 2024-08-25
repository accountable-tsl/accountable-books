import express from "express";
import { checkCompanyId } from "../middlewares/companyMiddleware";
import {
  allBankAccounts,
  allBanks,
  createBank,
  createBankAccount,
  singleBank,
  singleBankAccount,
} from "../controllers/bankControllers";

const router = express.Router({ mergeParams: true });

router.get("/", checkCompanyId, allBankAccounts);
router.get("/:id", checkCompanyId, singleBankAccount);
router.post("/", checkCompanyId, createBankAccount);

router.get("/accounts", checkCompanyId, allBankAccounts);
router.get("/accounts/:id", checkCompanyId, singleBankAccount);
router.post("/accounts", checkCompanyId, createBankAccount);

export default router;
