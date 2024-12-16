import express from "express";
import { createExchangeRates } from "../controllers/exRateController";

const router = express.Router({ mergeParams: true });

router.post("/exchange-rates", createExchangeRates);
// router.get("/");

export default router;
