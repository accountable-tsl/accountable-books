import express from "express";
import {
  checkAccountCode,
  checkAccountName,
  createCOA,
  createManyCOA,
} from "../controllers/coaControllers";
import { checkCompanyId } from "../middlewares/companyMiddleware";

const router = express.Router();

router.get("/check-code", checkCompanyId, checkAccountCode);
router.get("/check-name", checkCompanyId, checkAccountName);
router.post("/create", checkCompanyId, createCOA);
router.post("/create-bulk", checkCompanyId, createManyCOA);

export default router;
