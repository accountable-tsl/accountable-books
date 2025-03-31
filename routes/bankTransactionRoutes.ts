import express from "express";
import { checkCompanyId } from "../middlewares/companyMiddleware";
import {
  handleTransactionImport,
  retrieveBankTransactions,
} from "../controllers/bankTransactionControllers";

const router = express.Router({ mergeParams: true });

router.get("/all", checkCompanyId, retrieveBankTransactions);
router.post("/import", checkCompanyId, handleTransactionImport);

export default router;
