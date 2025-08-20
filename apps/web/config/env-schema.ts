/**
 * Web Environment Schema Configuration
 *
 * Single source of truth for all web app environment variables.
 * Generates only essential files: .env.local, .env.test, .env.example
 */

import type { EnvSchema } from '@accountable-books/utils/env/types';

// Target files to generate (only essential ones)
export const WEB_TARGET_FILES = ['.env.local', '.env.test', '.env.example'];

export const WEB_ENV_SCHEMA: EnvSchema = {
  // ============================================================================
  // API CONFIGURATION
  // ============================================================================
  VITE_BACKEND_URL: {
    description: 'Backend API URL (must start with VITE_ for Vite)',
    type: 'url',
    required: true,
    local: 'http://localhost:5000',
    test: 'http://localhost:3001',
    staging: 'https://api-staging.accountable.local',
    production: 'https://api.accountable.com',
  },

  // ============================================================================
  // THIRD-PARTY INTEGRATIONS
  // ============================================================================
  VITE_MONO_PUBLIC_KEY: {
    description: 'Mono bank connection service public key',
    type: 'string',
    required: false,
    test: 'test_mono_key',
  },

  // ============================================================================
  // ANALYTICS & MONITORING
  // ============================================================================
  VITE_MIXPANEL_TOKEN: {
    description: 'Mixpanel analytics token for frontend tracking',
    type: 'string',
    required: false,
    test: 'test-mixpanel-token',
  },

  VITE_SENTRY_DSN: {
    description: 'Sentry error tracking DSN for frontend',
    type: 'url',
    required: false,
  },

  // ============================================================================
  // FEATURE FLAGS
  // ============================================================================
  VITE_ENABLE_DEV_TOOLS: {
    description: 'Enable development tools and debugging features',
    type: 'boolean',
    required: false,
    local: 'true',
    test: 'false',
    staging: 'false',
    production: 'false',
  },

  VITE_API_TIMEOUT: {
    description: 'API request timeout in milliseconds',
    type: 'number',
    required: false,
    default: '10000',
  },
} as const;
