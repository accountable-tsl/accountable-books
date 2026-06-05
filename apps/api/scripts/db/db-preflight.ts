import '../../config/env-loader.js';

import type { Knex } from 'knex';
import knex from 'knex';

import knexConfig from '../../knexfile.js';
import {
  APP_SCHEMA,
  APP_SEARCH_PATH,
  formatReport,
  inspectDatabasePrereqs,
} from './lib/prereqs.js';

const ENV = (process.env.NODE_ENV || 'staging').toLowerCase();
const IS_LOCAL_STAGING =
  process.argv.includes('--local:staging') ||
  process.env.LOCAL_STAGING === 'true';
const DATABASE_MIGRATION_URL = process.env.DATABASE_MIGRATION_URL;

function assertSupportedEnvironment(): void {
  const isAllowed =
    (ENV === 'staging' && !IS_LOCAL_STAGING) || ENV === 'production';

  if (!isAllowed) {
    throw new Error(
      'db-preflight is for remote staging or production only. Local environments should be provisioned before verification.',
    );
  }
}

function getKnexConfig(): Knex.Config {
  const config = knexConfig[ENV];

  if (!config) {
    throw new Error(`Unsupported environment for db-preflight: ${ENV}`);
  }

  return config;
}

function normalizeSearchPath(value: string): string {
  return value
    .replace(/"/g, '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .join(', ');
}

function getExpectedMigrationRole(): string {
  if (!DATABASE_MIGRATION_URL) {
    throw new Error('DATABASE_MIGRATION_URL is required for db-preflight');
  }

  try {
    return decodeURIComponent(new URL(DATABASE_MIGRATION_URL).username);
  } catch (error) {
    throw new Error(
      `Unable to parse migration role from DATABASE_MIGRATION_URL: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function getErrors(
  report: Awaited<ReturnType<typeof inspectDatabasePrereqs>>,
  expectedRole: string,
): string[] {
  const errors: string[] = [];

  if (report.currentUser !== expectedRole) {
    errors.push(
      `current user must be "${expectedRole}", got "${report.currentUser}"`,
    );
  }

  if (report.timezone !== 'UTC') {
    errors.push(`timezone must be UTC, got ${report.timezone}`);
  }

  if (!report.hasAppSchema) {
    errors.push(`schema "${APP_SCHEMA}" is missing`);
  }

  if (normalizeSearchPath(report.searchPath) !== APP_SEARCH_PATH) {
    errors.push(
      `search_path must be "${APP_SEARCH_PATH}", got "${report.searchPath}"`,
    );
  }

  if (report.missingExtensions.length > 0) {
    errors.push(
      `missing required extensions: ${report.missingExtensions.join(', ')}`,
    );
  }

  if (!report.canUseAppSchema) {
    errors.push('current user lacks USAGE on schema app');
  }

  if (!report.canCreateInAppSchema) {
    errors.push('current user lacks CREATE on schema app');
  }

  if (!report.canUsePublicSchema) {
    errors.push('current user lacks USAGE on schema public');
  }

  if (report.canCreateInPublicSchema) {
    errors.push('current user must not have CREATE on schema public');
  }

  return errors;
}

async function run(): Promise<void> {
  assertSupportedEnvironment();

  const db = knex(getKnexConfig());

  try {
    const expectedRole = getExpectedMigrationRole();
    const report = await inspectDatabasePrereqs(db);
    const errors = getErrors(report, expectedRole);

    console.log(`  expected_user:      ${expectedRole}`);
    for (const line of formatReport(report)) {
      console.log(line);
    }

    if (errors.length > 0) {
      for (const error of errors) {
        console.error(`  error: ${error}`);
      }
      throw new Error('Database preflight failed');
    }

    console.log('✅ Database preflight passed');
  } finally {
    await db.destroy();
  }
}

run().catch((error) => {
  console.error('❌ Database preflight failed:', error);
  process.exit(1);
});
