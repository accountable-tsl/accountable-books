import express from "express";
import {
  getAllBanksController,
  getSingleBankController,
} from "./banks.controller";

const router = express.Router({ mergeParams: true });

router.get("/", getAllBanksController);
router.get("/id/:id", getSingleBankController);
router.get("/key/:key", getSingleBankController);

export default router;
