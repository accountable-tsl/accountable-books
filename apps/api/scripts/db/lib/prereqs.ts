import type { Knex } from 'knex';

export const APP_SCHEMA = 'app';
export const APP_SEARCH_PATH = 'app, public';

const BASE_REQUIRED_EXTENSIONS = [
  'pgcrypto',
  'pg_uuidv7',
  'pg_trgm',
  'vector',
  'citext',
  'unaccent',
  'btree_gist',
] as const;

const CRON_EXTENSION = 'pg_cron';

export type DatabasePrereqReport = {
  databaseName: string;
  currentUser: string;
  timezone: string;
  searchPath: string;
  hasAppSchema: boolean;
  canUseAppSchema: boolean;
  canCreateInAppSchema: boolean;
  canUsePublicSchema: boolean;
  canCreateInPublicSchema: boolean;
  requiredExtensions: string[];
  installedExtensions: string[];
  missingExtensions: string[];
};

export function isTestDatabase(databaseName: string): boolean {
  return databaseName.endsWith('_test');
}

export function getRequiredExtensions(databaseName: string): string[] {
  return isTestDatabase(databaseName)
    ? [...BASE_REQUIRED_EXTENSIONS]
    : [...BASE_REQUIRED_EXTENSIONS, CRON_EXTENSION];
}

export async function getCurrentDatabase(db: Knex): Promise<string> {
  const result = await db.raw('SELECT current_database() AS db');
  const databaseName = result.rows?.[0]?.db as string | undefined;

  if (!databaseName) {
    throw new Error('Unable to determine current database name');
  }

  return databaseName;
}

export async function getCurrentUser(db: Knex): Promise<string> {
  const result = await db.raw('SELECT current_user AS current_user');
  const currentUser = result.rows?.[0]?.current_user as string | undefined;

  if (!currentUser) {
    throw new Error('Unable to determine current database user');
  }

  return currentUser;
}

export async function getAvailableExtensions(db: Knex): Promise<Set<string>> {
  const result = await db.raw('SELECT name FROM pg_available_extensions');
  const rows = (result.rows ?? []) as Array<{ name: string }>;
  return new Set(rows.map((row) => row.name));
}

export async function getInstalledExtensions(db: Knex): Promise<Set<string>> {
  const result = await db.raw('SELECT extname FROM pg_extension');
  const rows = (result.rows ?? []) as Array<{ extname: string }>;
  return new Set(rows.map((row) => row.extname));
}

export async function inspectDatabasePrereqs(
  db: Knex,
): Promise<DatabasePrereqReport> {
  const databaseName = await getCurrentDatabase(db);
  const currentUser = await getCurrentUser(db);
  const requiredExtensions = getRequiredExtensions(databaseName);
  const installedExtensions = await getInstalledExtensions(db);

  const timezoneResult = await db.raw('SHOW TIMEZONE');
  const timezone = (timezoneResult.rows?.[0]?.TimeZone ??
    timezoneResult.rows?.[0]?.timezone ??
    '') as string;

  const searchPathResult = await db.raw('SHOW search_path');
  const searchPath = (searchPathResult.rows?.[0]?.search_path ?? '') as string;

  const schemaResult = await db.raw(
    `SELECT EXISTS (
      SELECT 1
      FROM information_schema.schemata
      WHERE schema_name = ?
    ) AS exists`,
    [APP_SCHEMA],
  );
  const hasAppSchema = Boolean(schemaResult.rows?.[0]?.exists);

  const publicPrivilegeResult = await db.raw(
    `SELECT
      has_schema_privilege(current_user, 'public', 'USAGE') AS public_usage,
      has_schema_privilege(current_user, 'public', 'CREATE') AS public_create`,
  );
  const publicUsage = Boolean(publicPrivilegeResult.rows?.[0]?.public_usage);
  const publicCreate = Boolean(publicPrivilegeResult.rows?.[0]?.public_create);

  let appUsage = false;
  let appCreate = false;

  if (hasAppSchema) {
    const appPrivilegeResult = await db.raw(
      `SELECT
        has_schema_privilege(current_user, ?, 'USAGE') AS app_usage,
        has_schema_privilege(current_user, ?, 'CREATE') AS app_create`,
      [APP_SCHEMA, APP_SCHEMA],
    );

    appUsage = Boolean(appPrivilegeResult.rows?.[0]?.app_usage);
    appCreate = Boolean(appPrivilegeResult.rows?.[0]?.app_create);
  }

  const installedExtensionList = [...installedExtensions].sort();
  const missingExtensions = requiredExtensions.filter(
    (extension) => !installedExtensions.has(extension),
  );

  return {
    databaseName,
    currentUser,
    timezone,
    searchPath,
    hasAppSchema,
    canUseAppSchema: appUsage,
    canCreateInAppSchema: appCreate,
    canUsePublicSchema: publicUsage,
    canCreateInPublicSchema: publicCreate,
    requiredExtensions,
    installedExtensions: installedExtensionList,
    missingExtensions,
  };
}

export async function initializeManagedDatabase(
  db: Knex,
): Promise<DatabasePrereqReport> {
  const databaseName = await getCurrentDatabase(db);
  const requiredExtensions = getRequiredExtensions(databaseName);
  const availableExtensions = await getAvailableExtensions(db);
  const missingAvailableExtensions = requiredExtensions.filter(
    (extension) => !availableExtensions.has(extension),
  );

  if (missingAvailableExtensions.length > 0) {
    throw new Error(
      `Missing required extensions in server: ${missingAvailableExtensions.join(', ')}`,
    );
  }

  await db.raw(`SET TIME ZONE 'UTC'`);
  await db.raw(`SET search_path TO ${APP_SEARCH_PATH}`);
  await db.raw(`ALTER DATABASE ?? SET timezone TO 'UTC'`, [databaseName]);
  await db.raw(`ALTER DATABASE ?? SET search_path TO ${APP_SEARCH_PATH}`, [
    databaseName,
  ]);
  await db.raw(`CREATE SCHEMA IF NOT EXISTS ${APP_SCHEMA}`);

  for (const extension of requiredExtensions) {
    await db.raw(`CREATE EXTENSION IF NOT EXISTS "${extension}"`);
  }

  const report = await inspectDatabasePrereqs(db);

  if (!report.hasAppSchema) {
    throw new Error(`Schema "${APP_SCHEMA}" was not created successfully`);
  }

  if (report.missingExtensions.length > 0) {
    throw new Error(
      `Required extensions failed to install: ${report.missingExtensions.join(', ')}`,
    );
  }

  return report;
}

export function formatReport(report: DatabasePrereqReport): string[] {
  return [
    `  database:            ${report.databaseName}`,
    `  current_user:        ${report.currentUser}`,
    `  timezone:            ${report.timezone}`,
    `  search_path:         ${report.searchPath}`,
    `  app_schema:          ${report.hasAppSchema ? 'present' : 'missing'}`,
    `  app_schema_usage:    ${report.canUseAppSchema ? 'yes' : 'no'}`,
    `  app_schema_create:   ${report.canCreateInAppSchema ? 'yes' : 'no'}`,
    `  public_schema_usage: ${report.canUsePublicSchema ? 'yes' : 'no'}`,
    `  public_schema_create:${report.canCreateInPublicSchema ? ' yes' : ' no'}`,
    `  required_extensions: ${report.requiredExtensions.join(', ')}`,
    `  installed_extensions:${report.installedExtensions.length > 0 ? ` ${report.installedExtensions.join(', ')}` : ' (none)'}`,
  ];
}
