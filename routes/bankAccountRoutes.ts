import express from "express";
import { checkCompanyId } from "../middlewares/companyMiddleware";
import {
  allBankAccounts,
  createBankAccount,
  singleBankAccount,
} from "../controllers/bankAccountControllers";

const router = express.Router({ mergeParams: true });

router.get("/", checkCompanyId, allBankAccounts);
router.get("/:id", checkCompanyId, singleBankAccount);
router.post("/", checkCompanyId, createBankAccount);

export default router;
