import express from "express";
import {
  categoriseBankTransaction,
  fetchTransactions,
} from "../../controllers/transactionController";
import { checkCompanyId } from "../middlewares/companyMiddleware";
import { basicLimiter } from "../middlewares/rateLimiter.middleware";

const router = express.Router({ mergeParams: true });

router.get("/", basicLimiter, checkCompanyId, fetchTransactions);
router.post("/categorise", checkCompanyId, categoriseBankTransaction);

export default router;
