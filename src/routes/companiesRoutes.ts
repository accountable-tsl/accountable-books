import express from "express";
import {
  createCompany,
  getAllCompanies,
  getSingleCompany,
} from "../../controllers/companiesController";
import { checkCompanyId } from "../middlewares/companyMiddleware";
import { basicLimiter } from "../middlewares/rateLimiter.middleware";
import { RequestHandler } from "express";

const limiter: RequestHandler =
  process.env.NODE_ENV === "development"
    ? (req, res, next) => next()
    : basicLimiter;

const router = express.Router();

router.get("/", getAllCompanies);
router.get("/:companyId", limiter, checkCompanyId, getSingleCompany);

router.post("/", createCompany);

// router.post("/",createACompany, companiesController.createCompany);

export default router;
