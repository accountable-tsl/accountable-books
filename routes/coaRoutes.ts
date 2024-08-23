import express from "express";
import {
  checkAccountCode,
  checkAccountName,
  createCOA,
} from "../controllers/coaControllers";
import { checkCompanyId } from "../middlewares/companyMiddleware";

const router = express.Router();

router.get("/check-code", checkCompanyId, checkAccountCode);
router.get("/check-name", checkCompanyId, checkAccountName);
router.post("/create", checkCompanyId, createCOA);

export default router;
