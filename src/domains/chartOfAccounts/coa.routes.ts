import express from "express";
import {
  archiveCoaController,
  deleteCoaController,
  editCoaController,
  getCoaController,
  unarchiveCoaController,
} from "./coa.controller";

const router = express.Router({ mergeParams: true });

router.get("/", getCoaController);

router.patch("/edit", editCoaController);
router.patch("/archive", archiveCoaController);
router.patch("/unarchive", unarchiveCoaController);

router.delete("/", deleteCoaController);

export default router;
