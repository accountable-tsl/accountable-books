import { verify } from "crypto";
import { emailQueue } from "../jobs/queues/email.queue";

await emailQueue.add("send_verification_email", {
  to: "chesley.schamberger@ethereal.email",
  name: "Cool User",
  verifyUrl: "https://example.com/verify",
});

console.log("📨 Job added to email queue!");

// Create a test route to verify email sending works outside BullMQ

// async function testEmailDirectly() {
//   try {
//     console.log("Testing direct email send...");
//     await sendEmail({
//       to: "chesley.schamberger@ethereal.email",
//       subject: "Direct Test",
//       text: "This is a direct test email",
//       html: "<strong>This is a direct test email</strong>",
//     });
//     console.log("Direct email sent successfully");
//   } catch (error) {
//     console.error("Failed to send direct email:", error);
//   }
// }

// testEmailDirectly();
