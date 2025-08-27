/**
 * Environment Configuration
 *
 * This module provides type-safe access to environment variables and secrets.
 *
 * Usage:
 * - ENV.VARIABLE_NAME - Access regular environment variables (throws if undefined)
 * - SECRETS.SECRET_NAME - Access any secret variable (throws if undefined)
 *
 * Environment files:
 * - Local/Test: Uses .env.local for all variables
 * - Staging: Uses .env.staging + .env.secrets.staging
 * - Production: Uses .env.production + .env.secrets.production
 */

import { nodeEnv, type NodeEnv } from '../core/types/core.js';

// Get current environment
export const NODE_ENV: NodeEnv = nodeEnv.parse(process.env.NODE_ENV || 'local');

// This module only provides typed access to already-loaded env

// Create proxy for ENV that throws on undefined access
const createEnvProxy = (envVars: NodeJS.ProcessEnv) => {
  return new Proxy(envVars, {
    get(target, prop: string) {
      const value = target[prop];
      if (value === undefined) {
        throw new Error(`Required environment variable ${prop} is not set`);
      }
      return value;
    },
  });
};

// Create proxy for SECRETS that throws on undefined access
const createSecretsProxy = (envVars: NodeJS.ProcessEnv) => {
  return new Proxy(envVars, {
    get(target, prop: string) {
      const value = target[prop];
      if (value === undefined) {
        const fileHint =
          NODE_ENV === 'local' || NODE_ENV === 'test'
            ? `.env.${NODE_ENV} file`
            : `.env.secrets.${NODE_ENV} file`;
        throw new Error(`Required secret ${prop} is not set. Please check your ${fileHint}`);
      }
      return value;
    },
  });
};

// Export the environment objects
export const ENV = createEnvProxy(process.env);
export const SECRETS = createSecretsProxy(process.env);

// Environment helpers
export const isProd = NODE_ENV === 'production' || NODE_ENV === 'staging';
export const isDev = NODE_ENV === 'local';
