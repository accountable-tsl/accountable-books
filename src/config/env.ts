import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { nodeEnv, NodeEnv } from "../types/generic";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Detect if running in Docker
const DOCKER_MODE =
  process.env.DOCKER_MODE === "true" || fs.existsSync("/.dockerenv");

// Detect runtime environment
// export const NODE_ENV: NodeEnv = process.env.NODE_ENV || "local";
export const NODE_ENV: NodeEnv = nodeEnv.parse(process.env.NODE_ENV || "local");

// Mapping from NODE_ENV and Docker context to .env file names
const envFileMap: Record<NodeEnv, string> = {
  local: ".env.local",
  "docker.dev": ".env.docker.dev",
  "docker.staging": ".env.docker.staging",
  "docker.production": ".env.docker.production",
};

const determineEnvKey = (): NodeEnv => {
  if (!DOCKER_MODE) return "local";

  // Get base env without 'docker.' prefix if it exists
  const baseEnv = process.env.NODE_ENV || "dev";
  const dockerKey = `docker.${baseEnv}` as NodeEnv;

  // Check if the constructed key is valid
  if (Object.keys(envFileMap).includes(dockerKey)) {
    return dockerKey;
  }

  // Fallback
  return "docker.dev";
};

export const envKey: NodeEnv = determineEnvKey();
export const envFile = envFileMap[envKey];

if (!envFile) {
  console.warn(
    `⚠️ Unknown environment combination (NODE_ENV=${NODE_ENV}, DOCKER_MODE=${DOCKER_MODE}). Falling back to .env.local`
  );
}

dotenv.config({
  path: path.resolve(__dirname, `../../${envFile || ".env.local"}`),
});

console.log(`🌱 Loaded environment from: ${envFile}`);

export const ENV = process.env;
