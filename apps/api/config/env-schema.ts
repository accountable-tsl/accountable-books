/**
 * API Environment Schema Configuration
 *
 * Single source of truth for all API environment variables.
 * Generates only essential files: .env.local, .env.example
 */

import type { EnvSchema } from '@accountable-books/utils/env';

// Target environments to generate files for
export const API_TARGET_ENVIRONMENTS: ('local' | 'staging' | 'production')[] = [
  'local',
  'staging',
];

export const API_ENV_SCHEMA: EnvSchema = {
  // ============================================================================
  // RUNTIME CONFIGURATION
  // ============================================================================
  NODE_ENV: {
    description: 'Application environment',
    type: 'string',
    // Auto-generated per environment
  },

  PORT: {
    description: 'Server port',
    type: 'number',
    local: '5000',
    staging: '5001',
    production: '5000',
  },

  BASE_DOMAIN: {
    description: 'Base domain for the application',
    type: 'string',
    local: 'lvh.me',
    staging: 'localhost',
    production: 'getaccountable.com',
  },

  BACKEND_URL: {
    description: 'Backend API URL',
    type: 'url',
    local: 'http://api.lvh.me:5000',
    staging: 'http://localhost:5001',
    production: 'https://api.getaccountable.com',
  },

  FRONTEND_URL: {
    description: 'Frontend application URL',
    type: 'url',
    local: 'http://app.lvh.me:5173',
    staging: 'http://localhost:3000',
    production: 'https://app.getaccountable.com',
  },

  // I use .lvh for me in dev to test out subdomain implementation
  COOKIE_DOMAIN: {
    description: 'Domain for setting cookies (e.g. .lvh.me or localhost)',
    type: 'string',
    local: '.lvh.me',
    staging: 'localhost',
    production: '.getaccountable.com',
  },

  // ============================================================================
  // DATABASE CONFIGURATION
  // ============================================================================
  DB_HOST: {
    description: 'Database host',
    type: 'string',
    local: 'localhost',
    staging: 'localhost',
    production: 'ep-example-12345.us-east-1.aws.neon.tech',
  },

  DB_PORT: {
    description: 'Database port',
    type: 'number',
    local: '5433',
    staging: '5434',
    production: '5432',
  },

  POSTGRES_DB: {
    description: 'Database name',
    type: 'string',
    local: 'accountable_books',
    staging: 'accountable_books_staging',
    production: 'main',
  },

  POSTGRES_USER: {
    description: 'Database username',
    type: 'string',
    local: 'user',
    staging: 'app_user',
    production: 'app_user',
  },

  POSTGRES_PASSWORD: {
    description: 'Database password',
    type: 'secret',
    local: 'password',
  },

  DATABASE_URL: {
    description: 'Runtime PostgreSQL connection string',
    type: 'secret',
    local: 'postgresql://user:password@localhost:5433/accountable_books',
  },

  DATABASE_MIGRATION_URL: {
    description: 'Direct PostgreSQL connection string for migrations',
    type: 'secret',
    local: 'postgresql://user:password@localhost:5433/accountable_books',
  },

  // ============================================================================
  // REDIS CONFIGURATION
  // ============================================================================
  REDIS_URL: {
    description: 'Redis connection URL',
    type: 'secret',
    local: 'redis://localhost:6380',
  },

  REDIS_PASSWORD: {
    description: 'Redis password',
    type: 'secret',
    local: '',
  },

  LOCAL_STAGING_REDIS_URL: {
    description: 'Local Redis connection URL',
    type: 'secret',
    local: '',
  },

  // ============================================================================
  // ML ENGINE CONFIGURATION
  // ============================================================================
  ML_ENGINE_URL: {
    description: 'ML Engine API URL for transaction categorization',
    type: 'url',
    local: 'http://localhost:8000',
    staging: 'http://localhost:8000',
    production: 'https://ml-engine.getaccountable.com',
  },

  // ============================================================================
  // SECURITY CONFIGURATION
  // ============================================================================
  CSRF_SECRET: {
    description: 'CSRF protection secret',
    type: 'secret',
    minLength: 32,
  },

  JWT_ACCESS_SECRET: {
    description: 'JWT access token secret (min 32 chars)',
    type: 'secret',
    minLength: 32,
  },

  JWT_REFRESH_SECRET: {
    description: 'JWT refresh token secret (min 32 chars)',
    type: 'secret',
    minLength: 32,
  },

  /**
   * HMAC key for bank account-number blind indexes (fingerprints).
   * This is a durable identity secret — rotating it requires a deliberate
   * identity migration because plaintext account numbers are not retained.
   * Min 32 chars; use a dedicated secret distinct from APP_ENC_KEYS.
   */
  ACCOUNT_NUMBER_HMAC_KEY: {
    description:
      'HMAC key for bank account-number blind indexes (durable; non-routine rotation)',
    type: 'secret',
    minLength: 32,
    local: 'dev-account-number-hmac-key-do-not-use-in-prod',
  },

  ACCOUNT_NUMBER_FINGERPRINT_VERSION: {
    description: 'Account-number fingerprint algorithm version',
    type: 'number',
    local: '1',
    staging: '1',
    production: '1',
  },

  // ============================================================================
  // EMAIL CONFIGURATION
  // ============================================================================
  EMAIL_PROVIDER: {
    description:
      'App email service provider. Use dev for local/test no-op comms email, or postmark/ses for real delivery.',
    type: 'string',
    local: 'dev',
    staging: 'postmark',
  },

  POSTMARK_API_KEY: {
    description: 'Postmark API key for sending emails',
    type: 'secret',
  },

  EMAIL_FROM: {
    description: 'Default sender email address',
    type: 'string',
    default: 'support@getaccountable.com',
  },

  ADMIN_ALERT_EMAILS: {
    description:
      'Comma-separated admin email recipients for internal operational alerts',
    type: 'string',
    required: false,
  },

  COMMS_DELIVERY_RETENTION_DAYS: {
    description:
      'Days to retain terminal comms delivery audit rows before purge',
    type: 'number',
    local: '90',
    staging: '90',
    production: '90',
  },

  ETHEREAL_EMAIL: {
    description: 'Ethereal email for testing',
    type: 'string',
    required: false,
  },

  ETHEREAL_PASSWORD: {
    description: 'Ethereal email password for testing',
    type: 'secret',
    required: false,
  },

  // ============================================================================
  // SLACK NOTIFICATIONS
  // ============================================================================
  SLACK_SIGNING_SECRET: {
    description: 'Slack app signing secret',
    type: 'secret',
    required: false,
  },

  SLACK_BOT_TOKEN: {
    description: 'Slack bot token',
    type: 'secret',
    required: false,
  },

  SLACK_CHANNEL: {
    description: 'Default Slack channel for notifications',
    type: 'string',
    required: false,
    local: 'dev',
    staging: 'staging',
    default: 'general',
  },

  // ============================================================================
  // ANALYTICS & MONITORING
  // ============================================================================
  SENTRY_DSN: {
    description: 'Sentry error tracking DSN',
    type: 'secret',
    local:
      'https://dc1680a6d867d6d380f73083d6da30f3@o4509142160506880.ingest.de.sentry.io/4509142176104528',
  },

  SENTRY_RELEASE: {
    description: 'Sentry release version',
    type: 'string',
    default: '0.0.0',
  },

  POSTHOG_API_KEY: {
    description: 'PostHog server-side project API key',
    type: 'secret',
    required: false,
  },

  POSTHOG_HOST: {
    description: 'PostHog ingestion host (EU cloud)',
    type: 'url',
    required: false,
    local: 'https://eu.i.posthog.com',
    staging: 'https://eu.i.posthog.com',
    production: 'https://eu.i.posthog.com',
  },

  POSTHOG_ENABLED: {
    description: 'Enable PostHog product analytics (server-side)',
    type: 'boolean',
    required: false,
    local: 'false',
    staging: 'true',
    production: 'true',
    default: 'false',
  },

  TELEMETRY_ENABLED: {
    description:
      'Master switch for non-Sentry telemetry (PostHog, OTel traces)',
    type: 'boolean',
    required: false,
    local: 'false',
    staging: 'true',
    production: 'true',
    default: 'false',
  },

  // ============================================================================
  // OBJECT STORAGE (R2/S3)
  // ============================================================================
  R2_TOKEN: {
    description: 'Cloudflare R2 API token',
    type: 'secret',
    required: false,
  },

  R2_ACCESS_KEY_ID: {
    description: 'Cloudflare R2 access key ID',
    type: 'secret',
    required: false,
  },

  R2_SECRET_ACCESS_KEY: {
    description: 'Cloudflare R2 secret access key',
    type: 'secret',
    required: false,
  },

  R2_ENDPOINT: {
    description: 'Cloudflare R2 endpoint URL',
    type: 'secret',
    required: false,
    local: 'https://abcdefg.r2.cloudflarestorage.com',
  },

  R2_LOGOS_BUCKET_NAME: {
    description: 'Cloudflare R2 bucket name for logos',
    type: 'string',
    required: false,
    default: 'logos',
  },

  R2_LOGOS_DOMAIN: {
    description: 'Cloudflare R2 domain for logos',
    type: 'url',
    required: false,
    local: 'https://logos.getaccountable.com',
    staging: 'https://logos.getaccountable.com',
    production: 'https://logos.getaccountable.com',
  },

  R2_TRANSACTION_FILES_BUCKET_NAME: {
    description: 'Cloudflare R2 bucket name for transaction files',
    type: 'string',
    required: false,
    default: 'transaction-files',
  },

  PLATFORM_ACCOUNTING_FIRM_ID: {
    description: 'Platform accounting firm UUID',
    type: 'string',
    local: 'fb60dc2d-732e-4bf6-9f0c-74577354e816',
    staging: 'fb60dc2d-732e-4bf6-9f0c-74577354e816',
    production: 'fb60dc2d-732e-4bf6-9f0c-74577354e816',
  },

  PLATFORM_COMPANY_LOGO_URL: {
    description: 'Platform company logo URL',
    required: false,
    type: 'url',
    local: '',
    staging:
      'https://logos.getaccountable.com/42619yzn-25431a6c-59c7-4bf4-9348-be6e651d47dc.png',
    production:
      'https://logos.getaccountable.com/42619yzn-25431a6c-59c7-4bf4-9348-be6e651d47dc.png',
  },

  CONFIRM_PLATFORM_SETUP: {
    description: 'Confirm platform setup',
    type: 'string',
    required: false,
    staging: 'yes',
    production: 'yes',
  },

  // ============================================================================
  // ADMIN USER CONFIGURATION
  // ============================================================================
  TEST_ADMIN_ID: {
    description: 'Test admin user ID (UUID)',
    type: 'string',
    required: false,
    local: '00000000-0000-4000-8000-000000000000',
  },

  TEST_ADMIN_EMAIL: {
    description: 'Test admin user email',
    type: 'string',
    required: false,
    local: 'support@getaccountable.com',
  },

  TEST_ADMIN_FIRSTNAME: {
    description: 'Test admin user first name',
    type: 'string',
    required: false,
    local: 'Admin',
  },

  TEST_ADMIN_LASTNAME: {
    description: 'Test admin user last name',
    type: 'string',
    required: false,
    local: 'User',
  },

  TEST_ADMIN_PASSWORD: {
    description: 'Test admin user password',
    type: 'secret',
    required: false,
    local: 'StrongAdminPass!',
  },

  ADMIN_ID: {
    description: 'Production admin user ID (UUID)',
    type: 'string',
    required: false,
  },

  ADMIN_EMAIL: {
    description: 'Production admin user email',
    type: 'string',
    required: false,
  },

  ADMIN_FIRSTNAME: {
    description: 'Production admin user first name',
    type: 'string',
    required: false,
    default: 'System',
  },

  ADMIN_LASTNAME: {
    description: 'Production admin user last name',
    type: 'string',
    required: false,
    default: 'Administrator',
  },

  ADMIN_PASSWORD: {
    description: 'Production admin user password',
    type: 'secret',
    required: false,
  },

  // ============================================================================
  // DEVELOPMENT FEATURES
  // ============================================================================
  SEED_DB: {
    description: 'Whether to seed database with demo data',
    type: 'boolean',
    required: false,
    local: 'false',
    staging: 'true',
    production: 'false',
  },

  // ============================================================================
  // AI (APP-LEVEL)
  // ============================================================================
  AI_ENABLED: {
    description: 'Enable AI endpoints (app-level)',
    type: 'boolean',
    required: false,
    local: 'false',
    staging: 'false',
    production: 'false',
  },

  OPENAI_API_KEY: {
    description: 'OpenAI API key used by the AI orchestrator',
    type: 'secret',
    required: false,
    local: '',
  },

  OPENAI_MODEL: {
    description:
      'Default OpenAI model name for chat (capabilities may override)',
    type: 'string',
    required: false,
    local: 'gpt-4o-mini',
    staging: 'gpt-4o-mini',
    production: 'gpt-4o-mini',
  },

  BULLBOARD_USER: {
    description: 'Bull Board admin username',
    type: 'string',
    required: false,
    local: 'admin',
    default: 'admin',
  },

  BULLBOARD_PASSWORD: {
    description: 'Bull Board admin password',
    type: 'secret',
    required: false,
    local: 'secret',
  },

  // ============================================================================
  // FX RATE PROVIDERS
  // ============================================================================
  FX_PROVIDER_ORDER: {
    description:
      'Comma-separated FX provider chain order. Allowed: openexchangerates, exchangerate_api, fixer',
    type: 'string',
    required: false,
    local: 'openexchangerates,exchangerate_api,fixer',
    staging: 'openexchangerates,exchangerate_api,fixer',
    production: 'openexchangerates,exchangerate_api,fixer',
    default: 'openexchangerates,exchangerate_api,fixer',
  },

  FX_LOOKBACK_DAYS: {
    description: 'Maximum fallback days to look back for exchange rates',
    type: 'number',
    required: false,
    local: '5',
    staging: '5',
    production: '5',
    default: '5',
  },

  FX_HTTP_TIMEOUT_MS: {
    description: 'HTTP timeout in milliseconds for provider FX requests',
    type: 'number',
    required: false,
    local: '5000',
    staging: '5000',
    production: '5000',
    default: '5000',
  },

  OPENEXCHANGERATES_APP_ID: {
    description: 'Open Exchange Rates App ID',
    type: 'secret',
    required: false,
    local: '',
  },

  EXCHANGERATE_API_KEY: {
    description: 'ExchangeRate-API key',
    type: 'secret',
    required: false,
    local: '',
  },

  FIXER_API_KEY: {
    description: 'Fixer API access key',
    type: 'secret',
    required: false,
    local: '',
  },

  // ============================================================================
  // BANK FEED PROVIDERS
  // ============================================================================
  FEED_DISPLAY_NAME: {
    description: 'Name feed providers will display',
    type: 'string',
    required: false,
    local: 'Accountable',
  },
  MONO_SECRET_KEY: {
    description: 'Mono secret key',
    type: 'secret',
    required: false,
    local: 'test_sk_t72nrt2xsyizcr08j9ep',
  },

  PLAID_CLIENT_ID: {
    description: 'Plaid client ID',
    type: 'secret',
    local: '6849db53d71e300025a5abcb',
  },

  PLAID_SECRET: {
    description: 'Plaid secret',
    type: 'secret',
    local: 'afc8335d9193fa38981a998ea9e09a',
  },

  PLAID_COUNTRY_CODES: {
    description: 'Plaid country codes (comma-separated)',
    type: 'string',
    default: 'US,CA',
  },

  PLAID_PRODUCTS: {
    description: 'Plaid products (comma-separated)',
    type: 'string',
    default: 'auth,transactions',
  },

  PLAID_ENV: {
    description: 'Plaid environment',
    required: true,
    type: 'string',
    local: 'sandbox',
    staging: 'sandbox',
  },

  PLAID_VERSION: {
    description: 'Plaid API version',
    type: 'string',
    default: '2020-09-14',
  },

  PLAID_REDIRECT_URI: {
    description: 'Plaid redirect URI',
    required: false,
    type: 'string',
  },

  PLAID_WEBHOOK_SECRET: {
    description:
      'Plaid webhook verification secret (optional - enables webhook signature verification)',
    type: 'secret',
    required: false,
  },

  ENABLE_WEBHOOK_VERIFICATION: {
    description: 'Force webhook verification even in development mode',
    type: 'boolean',
    required: false,
    local: 'false',
    staging: 'true',
    production: 'true',
    default: 'false',
  },

  // ============================================================================
  // WORKER CONFIGURATION
  // ============================================================================
  EMAIL_WORKER_CONCURRENCY: {
    description: 'Number of concurrent email jobs to process',
    type: 'number',
    required: false,
    local: '5',
    staging: '5',
    production: '10',
    default: '5',
  },

  TRANSACTION_SYNC_CONCURRENCY: {
    description: 'Number of concurrent transaction sync connections to process',
    type: 'number',
    required: false,
    local: '3',
    staging: '3',
    production: '5',
    default: '3',
  },

  TRANSACTION_SYNC_CRON: {
    description:
      'Cron pattern for transaction sync scheduler (e.g., "0 2 * * *" for daily at 2 AM UTC, "0 */6 * * *" for every 6 hours)',
    type: 'string',
    required: false,
    local: '0 2 * * *', // Daily at 2 AM UTC
    staging: '0 */6 * * *', // Every 6 hours for more frequent testing
    production: '0 2 * * *', // Daily at 2 AM UTC
    default: '0 2 * * *',
  },

  ENABLE_REDIS_MONITORING: {
    description: 'Enable Redis command usage monitoring and logging',
    type: 'boolean',
    required: false,
    local: 'false',
    staging: 'true',
    production: 'true',
    default: 'false',
  },

  // ============================================================================
  // OTHERS
  // ============================================================================
  APP_ENC_KEY_ID: {
    description: 'Active AES-256 key id (0..255)',
    type: 'secret',
    default: '1',
    validation: (v: unknown) =>
      typeof v === 'string' && Number(v) >= 0 && Number(v) <= 255,
  },

  APP_ENC_KEYS: {
    // Example: 1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    description: 'Comma-separated keys as id:base64(32B)',
    type: 'secret',
    default: '1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    validation: (v: unknown) => {
      if (typeof v !== 'string') return false;
      return v.split(',').every((pair) => {
        const [idStr, b64] = pair.split(':');
        if (!idStr || !b64) return false;
        if (!/^\d+$/.test(idStr)) return false;
        if (b64.length !== 44) return false;
        return Buffer.from(b64, 'base64').length === 32;
      });
    },
  },
} as const;

// ==============================================================================
// ENVIRONMENT FILE GENERATION
// ==============================================================================

/**
 * Generate environment files for the API service
 * Can be executed directly: tsx apps/api/config/env-schema.ts
 */
export async function generateFiles() {
  const { createEnvGenerator } = await import('@accountable-books/utils/env');
  await createEnvGenerator('API', API_ENV_SCHEMA, API_TARGET_ENVIRONMENTS);
}

// Auto-run when executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  generateFiles().catch((error) => {
    console.error('Generation failed:', error);
    process.exit(1);
  });
}
