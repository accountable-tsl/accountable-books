/**
 * API Environment Schema Configuration
 *
 * Single source of truth for all API environment variables.
 * Generates only essential files: .env.local, .env.test, .env.example
 */

import type { EnvSchema } from '@accountable-books/utils/env/types';

// Target files to generate (only essential ones)
export const API_TARGET_FILES = ['.env.local', '.env.test', '.env.staging', '.env.example'];

export const API_ENV_SCHEMA: EnvSchema = {
  // ============================================================================
  // RUNTIME CONFIGURATION
  // ============================================================================
  NODE_ENV: {
    description: 'Application environment',
    type: 'string',
    required: true,
    // Auto-generated per environment
  },

  PORT: {
    description: 'Server port',
    type: 'number',
    required: true,
    local: '5000',
    test: '3001',
    staging: '5000',
    production: '5000',
  },

  BASE_DOMAIN: {
    description: 'Base domain for the application',
    type: 'string',
    required: true,
    default: 'localhost',
  },

  BACKEND_URL: {
    description: 'Backend API URL',
    type: 'url',
    required: true,
    local: 'http://localhost:5000',
    test: 'http://localhost:3001',
    staging: 'http://localhost:5000',
    production: 'https://api.getaccountable.com',
  },

  FRONTEND_URL: {
    description: 'Frontend application URL',
    type: 'url',
    required: true,
    local: 'http://localhost:5173',
    test: 'http://localhost:3000',
    staging: 'http://localhost:3000',
    production: 'https://app.getaccountable.com',
  },

  COOKIE_DOMAIN: {
    description: 'Domain for setting cookies',
    type: 'string',
    required: true,
    default: 'localhost',
  },

  // ============================================================================
  // DATABASE CONFIGURATION
  // ============================================================================
  DB_HOST: {
    description: 'Database host',
    type: 'string',
    required: true,
    local: 'localhost',
    test: 'localhost',
    staging: 'db',
    production: 'CHANGE_IN_PRODUCTION',
  },

  DB_PORT: {
    description: 'Database port',
    type: 'number',
    required: true,
    local: '5433',
    test: '5432',
    staging: '5432',
    production: '5432',
  },

  DB_NAME: {
    description: 'Database name',
    type: 'string',
    required: true,
    local: 'accountable_books',
    test: 'test_db',
    staging: 'accountable_books',
    production: 'CHANGE_IN_PRODUCTION',
  },

  DB_USER: {
    description: 'Database username',
    type: 'string',
    required: true,
    local: 'user',
    test: 'test',
    staging: 'user',
    production: 'CHANGE_IN_PRODUCTION',
  },

  DB_PASSWORD: {
    description: 'Database password',
    type: 'secret',
    required: true,
    local: 'password',
    test: 'test',
    staging: 'password',
    production: 'CHANGE_IN_PRODUCTION',
  },

  DATABASE_URL: {
    description: 'Complete PostgreSQL connection string',
    type: 'secret',
    required: true,
    local: 'postgres://user:password@localhost:5433/accountable_books',
    test: 'postgresql://test:test@localhost:5432/test_db',
    staging: 'postgresql://user:password@db:5432/accountable_books',
    production: 'CHANGE_IN_PRODUCTION',
  },

  // ============================================================================
  // REDIS CONFIGURATION
  // ============================================================================
  REDIS_URL: {
    description: 'Redis connection URL',
    type: 'url',
    required: true,
    local: 'redis://localhost:6380',
    test: 'redis://localhost:6379',
    staging: 'redis://redis:6379',
    production: 'CHANGE_IN_PRODUCTION',
  },

  // ============================================================================
  // SECURITY CONFIGURATION
  // ============================================================================
  CSRF_SECRET: {
    description: 'CSRF protection secret',
    type: 'secret',
    required: true,
    minLength: 32,
  },

  JWT_ACCESS_SECRET: {
    description: 'JWT access token secret (min 32 chars)',
    type: 'secret',
    required: true,
    minLength: 32,
  },

  JWT_REFRESH_SECRET: {
    description: 'JWT refresh token secret (min 32 chars)',
    type: 'secret',
    required: true,
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
    test: 'console',
    staging: 'console',
    default: 'postmark',
  },

  POSTMARK_API_KEY: {
    description: 'Postmark API key for sending emails',
    type: 'secret',
    required: false,
    test: 'test-postmark-key',
  },

  EMAIL_FROM: {
    description: 'Default sender email address',
    type: 'string',
    required: false,
    local: 'dev@accountable.local',
    test: 'test@example.com',
    default: 'noreply@accountable.com',
  },

  ETHEREAL_EMAIL: {
    description: 'Ethereal email for testing',
    type: 'string',
    required: false,
    test: 'test@ethereal.email',
  },

  ETHEREAL_PASSWORD: {
    description: 'Ethereal email password for testing',
    type: 'secret',
    required: false,
    test: 'test-password',
  },

  // ============================================================================
  // SLACK NOTIFICATIONS
  // ============================================================================
  SLACK_SIGNING_SECRET: {
    description: 'Slack app signing secret',
    type: 'secret',
    required: false,
    test: 'test-slack-signing-secret',
  },

  SLACK_BOT_TOKEN: {
    description: 'Slack bot token',
    type: 'secret',
    required: false,
    test: 'test-slack-bot-token',
  },

  SLACK_CHANNEL: {
    description: 'Default Slack channel for notifications',
    type: 'string',
    required: false,
    local: 'dev',
    test: 'test',
    staging: 'staging',
    default: 'general',
  },

  // ============================================================================
  // ANALYTICS & MONITORING
  // ============================================================================
  MIXPANEL_TOKEN: {
    description: 'Mixpanel analytics token',
    type: 'string',
    required: false,
    test: 'test-mixpanel-token',
  },

  SENTRY_DSN: {
    description: 'Sentry error tracking DSN',
    type: 'url',
    required: false,
    test: 'https://test@sentry.io/123456',
  },

  // ============================================================================
  // OBJECT STORAGE (R2/S3)
  // ============================================================================
  R2_TOKEN: {
    description: 'Cloudflare R2 API token',
    type: 'secret',
    required: false,
    test: 'test-r2-token',
  },

  R2_ACCESS_KEY_ID: {
    description: 'Cloudflare R2 access key ID',
    type: 'secret',
    required: false,
    test: 'test-access-key',
  },

  R2_SECRET_ACCESS_KEY: {
    description: 'Cloudflare R2 secret access key',
    type: 'secret',
    required: false,
    test: 'test-secret-key',
  },

  R2_ENDPOINT: {
    description: 'Cloudflare R2 endpoint URL',
    type: 'url',
    required: false,
    test: 'https://test.r2.cloudflarestorage.com',
  },

  R2_LOGOS_BUCKET_NAME: {
    description: 'Cloudflare R2 bucket name for logos',
    type: 'string',
    required: false,
    default: 'logos',
    test: 'test-bucket',
  },

  R2_LOGOS_DOMAIN: {
    description: 'Cloudflare R2 domain for logos',
    type: 'url',
    required: false,
    test: 'https://test.r2.cloudflarestorage.com',
  },

  // ============================================================================
  // PLATFORM COMPANY CONFIGURATION
  // ============================================================================
  PLATFORM_COMPANY_ID: {
    description: 'Main platform company UUID',
    type: 'string',
    required: true,
    local: 'a494b675-fedd-455c-ab6d-00ffdff9a047',
    test: '018f7e5e-1111-2222-3333-000000000001',
    staging: 'a494b675-fedd-455c-ab6d-00ffdff9a047',
    production: 'a494b675-fedd-455c-ab6d-00ffdff9a047',
  },

  PLATFORM_COMPANY_NAME: {
    description: 'Platform company legal name',
    type: 'string',
    required: true,
    local: 'Accountable Techserve Ltd',
    test: 'Test Platform Company',
    staging: 'Accountable Techserve Ltd',
    production: 'Accountable Techserve Ltd',
  },

  PLATFORM_COMPANY_SHORT_CODE: {
    description: 'Platform company short identifier',
    type: 'string',
    required: true,
    local: 'accX',
    test: 'TEST',
    staging: 'accX',
    production: 'accX',
  },

  PLATFORM_ACCOUNTING_FIRM_ID: {
    description: 'Platform accounting firm UUID',
    type: 'string',
    required: true,
    local: 'fb60dc2d-732e-4bf6-9f0c-74577354e816',
    test: '018f7e5e-4444-5555-6666-000000000002',
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
    test: '018f7e5e-0000-0000-0000-000000000001',
  },

  TEST_ADMIN_EMAIL: {
    description: 'Test admin user email',
    type: 'string',
    required: false,
    local: 'support@getaccountable.com',
    test: 'support@getaccountable.com',
  },

  TEST_ADMIN_FIRSTNAME: {
    description: 'Test admin user first name',
    type: 'string',
    required: false,
    local: 'Admin',
    test: 'Test',
  },

  TEST_ADMIN_LASTNAME: {
    description: 'Test admin user last name',
    type: 'string',
    required: false,
    local: 'User',
    test: 'Admin',
  },

  TEST_ADMIN_PASSWORD: {
    description: 'Test admin user password',
    type: 'secret',
    required: false,
    local: 'StrongAdminPass!',
    test: 'StrongAdminPass!',
  },

  ADMIN_ID: {
    description: 'Production admin user ID (UUID)',
    type: 'string',
    required: false,
    production: 'CHANGE_IN_PRODUCTION',
  },

  ADMIN_EMAIL: {
    description: 'Production admin user email',
    type: 'string',
    required: false,
    production: 'CHANGE_IN_PRODUCTION',
  },

  ADMIN_FIRSTNAME: {
    description: 'Production admin user first name',
    type: 'string',
    required: false,
    production: 'CHANGE_IN_PRODUCTION',
  },

  ADMIN_LASTNAME: {
    description: 'Production admin user last name',
    type: 'string',
    required: false,
    production: 'CHANGE_IN_PRODUCTION',
  },

  ADMIN_PASSWORD: {
    description: 'Production admin user password',
    type: 'secret',
    required: false,
    production: 'CHANGE_IN_PRODUCTION',
  },

  // ============================================================================
  // DEVELOPMENT FEATURES
  // ============================================================================
  SEED_DB: {
    description: 'Whether to seed database with demo data',
    type: 'boolean',
    required: false,
    local: 'false',
    test: 'false',
    staging: 'true',
    production: 'false',
  },

  BULLBOARD_USER: {
    description: 'Bull Board admin username',
    type: 'string',
    required: false,
    local: 'admin',
    test: 'test',
    default: 'admin',
  },

  BULLBOARD_PASSWORD: {
    description: 'Bull Board admin password',
    type: 'secret',
    required: false,
    local: 'secret',
    test: 'test',
  },
} as const;
