import { Queue } from "bullmq";
import { redis } from "../../lib/redis";
import { NODE_ENV } from "../../config/env";

const isProd = NODE_ENV === "production";

export const emailQueue = new Queue("email", {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: isProd ? { age: 3600, count: 1000 } : false,
    removeOnFail: false,
  },
});
