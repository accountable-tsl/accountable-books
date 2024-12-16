import express from "express";
import { createExchangeRates, getSingleExchangeRate } from "../controllers/exRateController";

const router = express.Router({ mergeParams: true });

router.post("/exchange-rates", createExchangeRates);
router.get("/exchange-rates", getSingleExchangeRate);

export default router;
