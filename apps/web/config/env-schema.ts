/**
 * Web Environment Schema Configuration
 *
 * Single source of truth for all web app environment variables.
 * Generates only essential files: .env.local, .env.test, .env.example
 */

import type { EnvSchema } from '@accountable-books/utils/env';

// Target environments to generate files for
export const WEB_TARGET_ENVIRONMENTS: ('local' | 'staging' | 'production')[] = [
  'local',
  'staging',
];

export const WEB_ENV_SCHEMA: EnvSchema = {
  // ============================================================================
  // API CONFIGURATION
  // ============================================================================
  VITE_BACKEND_URL: {
    description: 'Backend API URL (must start with VITE_ for Vite)',
    type: 'url',
    required: true,
    local: 'http://api.lvh.me:5000',
    staging: 'http://localhost:5001',
    production: 'https://api.getaccountable.com',
  },

  VITE_BASE_DOMAIN: {
    description: 'Base domain for the application',
    type: 'string',
    local: 'lvh.me',
    staging: 'localhost',
    production: 'app.getaccountable.com',
  },

  // ============================================================================
  // THIRD-PARTY INTEGRATIONS
  // ============================================================================
  VITE_MONO_PUBLIC_KEY: {
    description: 'Mono bank connection service public key',
    type: 'string',
    required: false,
  },

  // ============================================================================
  // ANALYTICS & MONITORING
  // ============================================================================
  VITE_SENTRY_DSN: {
    description: 'Sentry error tracking DSN for frontend',
    type: 'url',
    required: false,
  },

  VITE_POSTHOG_KEY: {
    description: 'PostHog project API key for browser SDK',
    type: 'string',
    required: false,
  },

  VITE_POSTHOG_HOST: {
    description: 'PostHog ingestion host (EU cloud)',
    type: 'url',
    required: false,
    local: 'https://eu.i.posthog.com',
    staging: 'https://eu.i.posthog.com',
    production: 'https://eu.i.posthog.com',
  },

  VITE_POSTHOG_ENABLED: {
    description: 'Enable PostHog product analytics in browser',
    type: 'boolean',
    required: false,
    local: 'false',
    staging: 'true',
    production: 'true',
    default: 'false',
  },

  VITE_TELEMETRY_ENABLED: {
    description: 'Master switch for browser telemetry (PostHog)',
    type: 'boolean',
    required: false,
    local: 'false',
    staging: 'true',
    production: 'true',
    default: 'false',
  },

  // ============================================================================
  // FEATURE FLAGS
  // ============================================================================
  VITE_ENABLE_DEV_TOOLS: {
    description: 'Enable development tools and debugging features',
    type: 'boolean',
    required: false,
    local: 'true',
    staging: 'false',
    production: 'false',
  },

  VITE_API_TIMEOUT: {
    description: 'API request timeout in milliseconds',
    type: 'number',
    required: false,
    default: '10000',
  },

  // ============================================================================
  // AI RUNTIME (APP-LEVEL SHELL)
  // ============================================================================
  VITE_AI_ENABLED: {
    description: 'Enable the app-level AI runtime + UI shell',
    type: 'boolean',
    required: false,
    local: 'true',
    staging: 'false',
    production: 'false',
  },

  VITE_AI_DISABLED_DOMAINS: {
    description:
      'Comma-separated list of AI domains to disable in the UI shell',
    type: 'string',
    required: false,
    local: '',
    staging: '',
    production: '',
  },

  VITE_AI_DISABLED_CAPABILITIES: {
    description:
      'Comma-separated list of AI capability IDs to disable in the UI shell',
    type: 'string',
    required: false,
    local: '',
    staging: '',
    production: '',
  },

  VITE_AI_ENABLED_DOMAINS: {
    description:
      'Optional comma-separated allowlist of AI domains. When set, only these domains are enabled in the UI shell.',
    type: 'string',
    required: false,
    local: '',
    staging: '',
    production: '',
  },

  VITE_AI_ENABLED_CAPABILITIES: {
    description:
      'Optional comma-separated allowlist of AI capability IDs. When set, only these capabilities are enabled in the UI shell.',
    type: 'string',
    required: false,
    local: '',
    staging: '',
    production: '',
  },
} as const;

// ==============================================================================
// ENVIRONMENT FILE GENERATION
// ==============================================================================

/**
 * Generate environment files for the Web service
 * Can be executed directly: tsx apps/web/config/env-schema.ts
 */
export async function generateFiles() {
  const { createEnvGenerator } = await import('@accountable-books/utils/env');
  await createEnvGenerator('Web', WEB_ENV_SCHEMA, WEB_TARGET_ENVIRONMENTS);
}

// Auto-run when executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  generateFiles().catch((error) => {
    console.error('Generation failed:', error);
    process.exit(1);
  });
}
