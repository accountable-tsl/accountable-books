import express from "express";
import { clientSignup } from "./onboarding.controller";

const router = express.Router({ mergeParams: true });

router.post("/signup", clientSignup);

export default router;
