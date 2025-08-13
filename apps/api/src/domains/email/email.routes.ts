import express from "express";
import { checkEmailController } from "./email.controller.js";

const router = express.Router({ mergeParams: true });

router.post("/check", checkEmailController);

export default router;
