import express from "express";
import { allCurrencies } from "./currency.controller";

const router = express.Router({ mergeParams: true });

router.get("/", allCurrencies);

export default router;
