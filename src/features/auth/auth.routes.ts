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
import { csrfProtection } from "./auth.utils";
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

router.get("/csrf-token", csrfProtection, (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});

export default router;
