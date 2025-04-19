import Redis from "ioredis";
import { ENV } from "../config/env";

export const redis = new Redis(ENV.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});
