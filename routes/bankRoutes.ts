import express from "express";
import {
  allBanks,
  createBank,
  singleBank,
  updateBank,
} from "../controllers/bankControllers";

const router = express.Router({ mergeParams: true });

router.get("/", allBanks);
router.get("/:id", singleBank);
router.post("/", createBank);
router.put("/:id", updateBank);

export default router;
