import express from "express";
import { checkCompanyId } from "../middlewares/companyMiddleware";
import {
  allBankAccounts,
  createBankAccount,
  singleBankAccount,
} from "../../controllers/bankAccountControllers";

const router = express.Router({ mergeParams: true });

router.get("/", checkCompanyId, allBankAccounts);
router.post("/", checkCompanyId, createBankAccount);
router.get("/:id", checkCompanyId, singleBankAccount);

export default router;
