/**
 * API Environment Schema Configuration
 *
 * Single source of truth for all API environment variables.
 * Generates only essential files: .env.local, .env.example
 */

import type { EnvSchema } from '@accountable-books/utils/env/types';

// Target environments to generate files for
export const API_TARGET_ENVIRONMENTS: ('local' | 'staging' | 'production')[] = [
  'local',
  'staging',
  'production',
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
    staging: '5000',
    production: '5000',
  },

  BASE_DOMAIN: {
    description: 'Base domain for the application',
    type: 'string',
    local: 'localhost',
    staging: 'localhost',
    production: 'getaccountable.com',
  },

  BACKEND_URL: {
    description: 'Backend API URL',
    type: 'url',
    local: 'http://localhost:5000',
    staging: 'http://localhost:5000',
    production: 'https://api.getaccountable.com',
  },

  FRONTEND_URL: {
    description: 'Frontend application URL',
    type: 'url',
    local: 'http://localhost:5173',
    staging: 'http://localhost:3000',
    production: 'https://app.getaccountable.com',
  },

  COOKIE_DOMAIN: {
    description: 'Domain for setting cookies',
    type: 'string',
    local: 'localhost',
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
    staging: 'db',
    production: 'ep-example-12345.us-east-1.aws.neon.tech',
  },

  DB_PORT: {
    description: 'Database port',
    type: 'number',
    local: '5433',
    staging: '5432',
    production: '5432',
  },

  POSTGRES_DB: {
    description: 'Database name',
    type: 'string',
    local: 'accountable_books',
    staging: 'accountable_books',
    production: 'main',
  },

  POSTGRES_USER: {
    description: 'Database username',
    type: 'string',
    local: 'user',
    staging: 'user',
    production: 'neondb_owner',
  },

  POSTGRES_PASSWORD: {
    description: 'Database password',
    type: 'secret',
    local: 'password',
  },

  DATABASE_URL: {
    description: 'Complete PostgreSQL connection string',
    type: 'secret',
    local: 'postgres://user:password@localhost:5433/accountable_books',
  },

  // ============================================================================
  // REDIS CONFIGURATION
  // ============================================================================
  REDIS_URL: {
    description: 'Redis connection URL',
    type: 'url',
    local: 'redis://localhost:6380',
    staging: 'redis://redis:6379',
    production: 'rediss://default:password@region-cache.upstash.io:6380',
  },

  REDIS_PASSWORD: {
    description: 'Redis password',
    type: 'secret',
    local: '',
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

  // ============================================================================
  // EMAIL CONFIGURATION
  // ============================================================================
  EMAIL_PROVIDER: {
    description: 'Email service provider',
    type: 'string',
    required: false,
    local: 'postmark',
    staging: 'console',
    default: 'postmark',
  },

  POSTMARK_API_KEY: {
    description: 'Postmark API key for sending emails',
    type: 'secret',
    required: false,
  },

  EMAIL_FROM: {
    description: 'Default sender email address',
    type: 'string',
    required: false,
    local: 'dev@accountable.local',
    default: 'noreply@accountable.com',
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
  MIXPANEL_TOKEN: {
    description: 'Mixpanel analytics token',
    type: 'secret',
    required: false,
  },

  SENTRY_DSN: {
    description: 'Sentry error tracking DSN',
    type: 'url',
    required: false,
    local: 'https://your-sentry-dsn@sentry.io/project',
    production:
      'https://dc1680a6d867d6d380f73083d6da30f3@o4509142160506880.ingest.de.sentry.io/4509142176104528',
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
    type: 'url',
    required: false,
    local: 'https://your-account-id.r2.cloudflarestorage.com',
    production: 'https://1234567890abcdef.r2.cloudflarestorage.com',
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
    local: 'https://logos.accountable.local',
    production: 'https://logos.accountable.com',
  },

  // ============================================================================
  // PLATFORM COMPANY CONFIGURATION
  // ============================================================================
  PLATFORM_COMPANY_ID: {
    description: 'Main platform company UUID',
    type: 'string',
    local: 'a494b675-fedd-455c-ab6d-00ffdff9a047',
    staging: 'a494b675-fedd-455c-ab6d-00ffdff9a047',
    production: 'a494b675-fedd-455c-ab6d-00ffdff9a047',
  },

  PLATFORM_COMPANY_NAME: {
    description: 'Platform company legal name',
    type: 'string',
    local: 'Accountable Techserve Ltd',
    staging: 'Accountable Techserve Ltd',
    production: 'Accountable Techserve Ltd',
  },

  PLATFORM_COMPANY_SHORT_CODE: {
    description: 'Platform company short identifier',
    type: 'string',
    local: 'accX',
    staging: 'accX',
    production: 'accX',
  },

  PLATFORM_ACCOUNTING_FIRM_ID: {
    description: 'Platform accounting firm UUID',
    type: 'string',
    local: 'fb60dc2d-732e-4bf6-9f0c-74577354e816',
    staging: 'fb60dc2d-732e-4bf6-9f0c-74577354e816',
    production: 'fb60dc2d-732e-4bf6-9f0c-74577354e816',
  },

  // ============================================================================
  // ADMIN USER CONFIGURATION
  // ============================================================================
  TEST_ADMIN_ID: {
    description: 'Test admin user ID (UUID)',
    type: 'string',
    required: false,
    local: '018f7e5e-0000-0000-0000-000000000001',
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
    production: '018f7e5e-9999-8888-7777-000000000001',
  },

  ADMIN_EMAIL: {
    description: 'Production admin user email',
    type: 'string',
    required: false,
    production: 'admin@getaccountable.com',
  },

  ADMIN_FIRSTNAME: {
    description: 'Production admin user first name',
    type: 'string',
    required: false,
    production: 'System',
  },

  ADMIN_LASTNAME: {
    description: 'Production admin user last name',
    type: 'string',
    required: false,
    production: 'Administrator',
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
} as const;

// ==============================================================================
// ENVIRONMENT FILE GENERATION
// ==============================================================================

/**
 * Generate environment files for the API service
 * Can be executed directly: tsx apps/api/config/env-schema.ts
 */
export async function generateFiles() {
  const { createEnvGenerator } = await import('@accountable-books/utils/env/cli');
  await createEnvGenerator('API', API_ENV_SCHEMA, API_TARGET_ENVIRONMENTS);
}

// Auto-run when executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  generateFiles().catch((error) => {
    console.error('Generation failed:', error);
    process.exit(1);
  });
}
