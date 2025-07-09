import express from "express";
import { createMulter, multerErrorHandler } from "./objects.utils";
import {
  deleteObjectController,
  uploadObjectController,
} from "./objects.controller";

const router = express.Router({ mergeParams: true });
const upload = createMulter();

router.post(
  "/:objectType/upload",
  upload.single("file"),
  uploadObjectController
);

router.delete("/:objectType/delete", deleteObjectController);

export default router;
