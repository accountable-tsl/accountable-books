import express from "express";
import companiesController from "../controllers/companiesController";
import { createACompany } from "../models/companiesModel";

const router = express.Router();

router.post("/", companiesController.createCompany);
// router.post("/",createACompany, companiesController.createCompany);

export default router;
