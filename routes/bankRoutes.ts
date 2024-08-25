import express from "express";
import { checkCompanyId } from "../middlewares/companyMiddleware";
import {
  allBanks,
  createBank,
  singleBank,
} from "../controllers/bankControllers";

const router = express.Router({ mergeParams: true });

router.get("/", allBanks);
router.get("/:id", checkCompanyId, singleBank);
router.post("/", checkCompanyId, createBank);

export default router;
