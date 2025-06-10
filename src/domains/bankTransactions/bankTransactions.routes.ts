import express from "express";
import { checkCompanyId } from "../../core/middlewares/companies.middleware";
import { handleTransactionImport } from "./bankTransactions.controller";

const router = express.Router({ mergeParams: true });

// router.get("/all", checkCompanyId, retrieveBankTransactions);
router.post("/import", checkCompanyId, handleTransactionImport);

export default router;
