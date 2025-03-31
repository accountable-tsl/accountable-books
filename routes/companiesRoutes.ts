import express from "express";
import {
  createCompany,
  getAllCompanies,
  getSingleCompany,
} from "../controllers/companiesController";
import { checkCompanyId } from "../middlewares/companyMiddleware";
import { basicLimiter } from "../middlewares/rateLimiter";

const router = express.Router();

router.get("/", getAllCompanies);
router.get("/:companyId", basicLimiter, checkCompanyId, getSingleCompany);

router.post("/", createCompany);

// router.post("/",createACompany, companiesController.createCompany);

export default router;
