import express from "express";
import { fetchTransactions } from "../controllers/transactionController";
import { checkCompanyId } from "../middlewares/companyMiddleware";

const router = express.Router({ mergeParams: true });

router.get("/", checkCompanyId, fetchTransactions);

export default router;
