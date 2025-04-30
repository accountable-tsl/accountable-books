import express from "express";
import {
  loginController,
  logoutController,
  meController,
  refreshTokenController,
} from "./auth.controller";
import { verifyRefreshToken } from "./auth.middleware";
import { authLimiter } from "../../core/middlewares/rateLimiter.middleware";
const router = express.Router({ mergeParams: true });

// router.post("/login", authLimiter, loginController);
router.post("/login", loginController);
router.post(
  "/refresh",
  authLimiter,
  verifyRefreshToken,
  refreshTokenController
);
router.get("/me", verifyRefreshToken, meController);
router.post("/logout", verifyRefreshToken, logoutController);

export default router;
