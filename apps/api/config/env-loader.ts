import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envs = ['local', 'test', 'staging', 'production'];
const currentEnv = process.env.NODE_ENV || 'local';

if (!envs.includes(currentEnv)) {
  throw new Error(`Unsupported environment: ${currentEnv}`);
}

const loadEnvFiles = () => {
  const envFile = `.env.${currentEnv}`;
  const envPath = path.resolve(__dirname, `../${envFile}`);

  // Check if specific environment file exists, fallback to .env.local for test
  let actualEnvFile = envFile;
  let actualEnvPath = envPath;

  if (currentEnv === 'test' && !fs.existsSync(envPath)) {
    // Fallback to .env.local for test environment when .env.test doesn't exist
    actualEnvFile = '.env.local';
    actualEnvPath = path.resolve(__dirname, `../.env.local`);
    console.log(`🌱 Using .env.local for test environment (no .env.test found)`);
  }

  dotenv.config({ path: actualEnvPath });
  console.log(`🌱 Loaded environment from: ${actualEnvFile}`);

  if (currentEnv === 'staging' || currentEnv === 'production') {
    const secretsFile = `.env.secrets.${currentEnv}`;
    try {
      dotenv.config({ path: path.resolve(__dirname, `../${secretsFile}`) });
      console.log(`🔐 Loaded secrets from: ${secretsFile}`);
    } catch {
      console.warn(`⚠️ No secrets file found at: ${secretsFile}`);
    }
  } else {
    console.log(`No separate secrets file for ${currentEnv} environment`);
  }
};

loadEnvFiles();

export const isDev = currentEnv === 'local' || currentEnv === 'test';
export const isProd = currentEnv === 'staging' || currentEnv === 'production';
export const ENV = process.env;
