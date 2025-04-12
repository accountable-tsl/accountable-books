import rateLimit from "express-rate-limit";

export const basicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: "Too many requests",
  keyGenerator: (req) => {
    const normalizedPath = req.route?.path || req.path;
    return req.ip + normalizedPath;
  },
});
