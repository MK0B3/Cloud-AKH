// backend/config/env.js
import { config } from "dotenv";

// In production (EC2), .env doesn't exist — env vars come from the container runtime.
// dotenv silently does nothing if the file is missing, which is exactly what we want.
config({ path: ".env" });

export const {
  PORT,
  AWS_REGION,
  PAPERS_TABLE,
  SUBSCRIPTIONS_TABLE,
  S3_BUCKET,
} = process.env;

if (!PORT) throw new Error("PORT is not defined");
if (!AWS_REGION) throw new Error("AWS_REGION is not defined");
if (!PAPERS_TABLE) throw new Error("PAPERS_TABLE is not defined");
if (!SUBSCRIPTIONS_TABLE) throw new Error("SUBSCRIPTIONS_TABLE is not defined");
if (!S3_BUCKET) throw new Error("S3_BUCKET is not defined");