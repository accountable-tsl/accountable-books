import { Queue } from "bullmq";
import { redis } from "../src/lib/bullmq";

const testQueue = new Queue("email", { connection: redis });

(async () => {
  await testQueue.add("send_verification_email", {
    to: "test@example.com",
    name: "Test User",
    token: "fake-token-123",
  });

  console.log("📤 Job added to queue");
})();
