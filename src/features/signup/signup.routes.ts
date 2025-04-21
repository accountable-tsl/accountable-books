import express from "express";
import { clientSignup } from "./signup.controller";
import { authLimiter } from "../../middlewares/rateLimiter.middleware";

const router = express.Router({ mergeParams: true });

router.post("/signup", authLimiter, clientSignup);

export default router;
