import { ListBucketsCommand, S3Client } from "@aws-sdk/client-s3";
import { ENV } from "../config/env.js";

const token = ENV.R2_TOKEN;
const accessKeyId = ENV.R2_ACCESS_KEY_ID;
const secretAccessKey = ENV.R2_SECRET_ACCESS_KEY;
const endpoint = ENV.R2_ENDPOINT;
if (!token || !accessKeyId || !secretAccessKey || !endpoint) {
  throw new Error("Missing R2 credentials");
}

export const r2Client = new S3Client({
  region: "auto",
  endpoint: endpoint,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

// const buckets = await r2Client.send(new ListBucketsCommand({}));
// console.log(buckets);
