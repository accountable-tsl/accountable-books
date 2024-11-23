import express from "express";
import { createCompany, getAllCompanies, getSingleCompany } from "../controllers/companiesController";
import { createACompany } from "../models/companiesModel";
import { checkCompanyId } from "../middlewares/companyMiddleware";

const router = express.Router();

router.get("/", getAllCompanies);
router.get("/:companyId", checkCompanyId, getSingleCompany)

router.post("/", createCompany);

// router.post("/",createACompany, companiesController.createCompany);

export default router;
