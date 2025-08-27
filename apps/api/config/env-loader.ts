import dotenv from 'dotenv';
import path from 'path';
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
  dotenv.config({ path: path.resolve(__dirname, `../${envFile}`) });
  console.log(`🌱 Loaded environment from: ${envFile}`);

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
