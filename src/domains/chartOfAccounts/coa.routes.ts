import express from "express";
import { getCoaController } from "./coa.controller";

const router = express.Router({ mergeParams: true });

router.get("/", getCoaController);

export default router;
