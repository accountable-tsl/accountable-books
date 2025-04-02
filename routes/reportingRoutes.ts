import express from "express";
import { checkCompanyId } from "../middlewares/companyMiddleware";
import { fetchLedgerEntries } from "../controllers/reportingController";

const router = express.Router({ mergeParams: true });

router.post("/", checkCompanyId, fetchLedgerEntries);

export default router;
