import express from "express";
import {
  loginController,
  logoutController,
  meController,
  refreshTokenController,
  resendVerEmailController,
  verifyEmailController,
} from "./auth.controller";
import { verifyRefreshToken } from "./auth.middleware";
import { authLimiter } from "../../core/middlewares/rateLimiter.middleware";
const router = express.Router({ mergeParams: true });

// router.post("/login", authLimiter, loginController);
router.post("/login", loginController);
router.post("/refresh", verifyRefreshToken, refreshTokenController);
router.get("/me", verifyRefreshToken, meController);
router.post("/logout", verifyRefreshToken, logoutController);
router.get("/verify-email", verifyEmailController);
router.post(
  "/resend-verification",
  verifyRefreshToken,
  resendVerEmailController
);

export default router;
