import express from "express";
import { getCountryList } from "./countries.controller";

const router = express.Router({ mergeParams: true });

router.get("/", getCountryList);

export default router;
