import express from "express";
import { accountMetaController } from "./account.controller";

const router = express.Router({ mergeParams: true });

router.get("/", accountMetaController);

export default router;
