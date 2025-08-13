import express from "express";
import {
  getAllBanksController,
  getBankByCountryController,
  getBankByIdController,
  getBankByKeyController,
} from "./banks.controller.js";

const router = express.Router({ mergeParams: true });

router.get("/", getAllBanksController);
router.get("/by-id/:id", getBankByIdController);
router.get("/by-key/:key", getBankByKeyController);
router.get("/by-country", getBankByCountryController);

export default router;
