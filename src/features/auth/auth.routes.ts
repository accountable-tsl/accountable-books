import express from "express";
import { loginController, refreshTokenController } from "./auth.controller";
import { verifyRefreshToken } from "./auth.middleware";
import { authLimiter } from "../../core/middlewares/rateLimiter.middleware";
const router = express.Router({ mergeParams: true });

router.post("/login", authLimiter, loginController);
// router.post("/login", loginController);
router.post(
  "/refresh",
  authLimiter,
  verifyRefreshToken,
  refreshTokenController
);

export default router;
