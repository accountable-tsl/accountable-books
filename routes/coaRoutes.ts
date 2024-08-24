import express from "express";
import {
  checkAccountCode,
  checkAccountName,
  createBulk,
  createBulkCOA,
  createCOA,
  getAccountTypes,
  getCOA,
  uploadCOA,
} from "../controllers/coaControllers";
import { checkCompanyId } from "../middlewares/companyMiddleware";
import { uploadCSV } from "../middlewares/uploadMiddleware";

const router = express.Router({ mergeParams: true });

router.get("/account-types", getAccountTypes);
router.get("/", checkCompanyId, getCOA);

router.get("/check-code", checkCompanyId, checkAccountCode);
router.get("/check-name", checkCompanyId, checkAccountName);

router.post("/create", checkCompanyId, createCOA);
router.post("/create-bulk", checkCompanyId, createBulkCOA);

export default router;
