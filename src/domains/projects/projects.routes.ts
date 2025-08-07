import express from "express";
import {
  addNewProjectsController,
  getProjectsController,
} from "./projects.controller";

const router = express.Router({ mergeParams: true });

router.post("/query", getProjectsController);
router.post("/", addNewProjectsController);

export default router;
