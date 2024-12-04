import express from "express";
import { allCurrencies } from "../controllers/currenciesController";

const router = express.Router({ mergeParams: true });

router.get("/", allCurrencies);

export default router;
