import express from "express";
import {
  categoriseBankTransaction,
  fetchTransactions,
} from "../controllers/transactionController";
import { checkCompanyId } from "../middlewares/companyMiddleware";

const router = express.Router({ mergeParams: true });

router.get("/", checkCompanyId, fetchTransactions);
router.post("/categorise", checkCompanyId, categoriseBankTransaction);

export default router;
