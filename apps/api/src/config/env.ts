import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { nodeEnv, type NodeEnv } from '../core/types/core.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Detect runtime environment
export const NODE_ENV: NodeEnv = nodeEnv.parse(process.env.NODE_ENV || 'local');

// Mapping from NODE_ENV and Docker context to .env file names
const envFileMap: Record<NodeEnv, string> = {
  local: '.env.local',
  production: '.env.production',
  staging: '.env.staging',
  test: '.env.test',
};

const determineEnvKey = (): NodeEnv => {
  // Get base env without 'docker.' prefix if it exists
  const baseEnv = process.env.NODE_ENV || 'dev';
  const dockerKey = `docker.${baseEnv}` as NodeEnv;

  // Check if the constructed key is valid
  if (Object.keys(envFileMap).includes(dockerKey)) {
    return dockerKey;
  }

  // Fallback
  return 'local';
};

export const envKey: NodeEnv = determineEnvKey();
export const envFile = envFileMap[envKey];

if (!envFile) {
  console.warn(
    `⚠️ Unknown environment combination (NODE_ENV=${NODE_ENV}). Falling back to .env.local`,
  );
}

dotenv.config({
  path: path.resolve(__dirname, `../../${envFile || '.env.local'}`),
});

// console.log(`🌱 Loaded environment from: ${envFile}`);

export const ENV = process.env;
export const isProd = NODE_ENV === 'production' || NODE_ENV === 'staging';
export const isDev = NODE_ENV === 'local';
