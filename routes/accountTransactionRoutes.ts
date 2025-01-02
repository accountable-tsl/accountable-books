import express from "express";
import { checkCompanyId } from "../middlewares/companyMiddleware";
import { postAccountTransactions } from "../controllers/accountTransactionControllers";

const router = express.Router({ mergeParams: true });

router.post("/", checkCompanyId, postAccountTransactions)

export default router;