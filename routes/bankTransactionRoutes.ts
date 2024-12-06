import express from "express";
import { checkCompanyId } from "../middlewares/companyMiddleware";
import { handleTransactionImport } from "../controllers/bankTransactionControllers";

const router = express.Router({ mergeParams: true });

router.post(
  "/bank-accounts/:bankAccountId/transactions/import",
  checkCompanyId,
  handleTransactionImport
);

export default router;
