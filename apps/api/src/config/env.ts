import { nodeEnv } from '../core/types/core.js';

import type { NodeEnv } from '../core/types/core.js';

/**
 * Environment Configuration
 *
 * This module provides typed access to environment variables.
 * Environment files are loaded by env-loader.ts before this module runs.
 *
 * Usage:
 * - ENV.VARIABLE_NAME - Access any environment variable
 */

// Get current environment
export const NODE_ENV: NodeEnv = nodeEnv.parse(process.env.NODE_ENV || 'local');

// Export environment variables directly
export const ENV = process.env;

// Environment helpers
export const isProd = NODE_ENV === 'production' || NODE_ENV === 'staging';
export const isTest = NODE_ENV === 'test';
export const isDev = NODE_ENV === 'local';
export const isLocalStaging =
  process.argv.includes('--local:staging') ||
  process.env.LOCAL_STAGING === 'true';
