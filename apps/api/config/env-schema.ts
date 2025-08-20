/**
 * API Environment Schema Configuration
 *
 * Single source of truth for all API environment variables.
 * Generates only essential files: .env.local, .env.test, .env.example
 */

import type { EnvSchema } from '@accountable-books/utils/env/types';

// Target files to generate (only essential ones)
export const API_TARGET_FILES = ['.env.local', '.env.test', '.env.example'];

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
    staging: 'https://api-staging.accountable.local',
    production: 'https://api.accountable.com',
  },

  FRONTEND_URL: {
    description: 'Frontend application URL',
    type: 'url',
    required: true,
    local: 'http://localhost:5173',
    test: 'http://localhost:3000',
    staging: 'https://app-staging.accountable.local',
    production: 'https://app.accountable.com',
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
    staging: 'CHANGE_IN_PRODUCTION',
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
    staging: 'CHANGE_IN_PRODUCTION',
    production: 'CHANGE_IN_PRODUCTION',
  },

  DB_USER: {
    description: 'Database username',
    type: 'string',
    required: true,
    local: 'user',
    test: 'test',
    staging: 'CHANGE_IN_PRODUCTION',
    production: 'CHANGE_IN_PRODUCTION',
  },

  DB_PASSWORD: {
    description: 'Database password',
    type: 'secret',
    required: true,
    local: 'password',
    test: 'test',
    staging: 'CHANGE_IN_PRODUCTION',
    production: 'CHANGE_IN_PRODUCTION',
  },

  DATABASE_URL: {
    description: 'Complete PostgreSQL connection string',
    type: 'secret',
    required: true,
    local: 'postgres://user:password@localhost:5433/accountable_books',
    test: 'postgresql://test:test@localhost:5432/test_db',
    staging: 'CHANGE_IN_PRODUCTION',
    production: 'CHANGE_IN_PRODUCTION',
  },

  // ============================================================================
  // REDIS CONFIGURATION
  // ============================================================================
  REDIS_URL: {
    description: 'Redis connection URL',
    type: 'url',
    required: true,
    default: 'redis://localhost:6380',
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

  R2_BUCKET: {
    description: 'Cloudflare R2 bucket name',
    type: 'string',
    required: false,
    test: 'test-bucket',
  },

  // ============================================================================
  // DEVELOPMENT FEATURES
  // ============================================================================
  SEED_DB: {
    description: 'Whether to seed database with demo data',
    type: 'boolean',
    required: false,
    default: 'false',
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
