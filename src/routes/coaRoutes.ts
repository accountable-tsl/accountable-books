import express from "express";
import {
  archiveCOA,
  archiveSingleCOA,
  checkAccountCode,
  checkAccountName,
  createBulkCOA,
  createCOA,
  getAccountTypes,
  getCOA,
  getSingleCOA,
  updateCOA,
} from "../../controllers/coaControllers";
import { checkCompanyId } from "../middlewares/companyMiddleware";
import { uploadCSV } from "../middlewares/uploadMiddleware";

const router = express.Router({ mergeParams: true });

router.get("/check-code", checkCompanyId, checkAccountCode);
router.get("/check-name", checkCompanyId, checkAccountName);
router.get("/account-types", getAccountTypes);

router.get("/", checkCompanyId, getCOA);
router.get("/:id", checkCompanyId, getSingleCOA);

router.post("/create", checkCompanyId, createCOA);
router.post("/create-bulk", checkCompanyId, createBulkCOA);

router.patch("/:id", checkCompanyId, updateCOA);

router.delete("/:id", checkCompanyId, archiveCOA);
router.delete("/", checkCompanyId, archiveSingleCOA);

export default router;
