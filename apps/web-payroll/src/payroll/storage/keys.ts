/**
 * Storage key management for payroll data.
 *
 * All keys use a namespace prefix to avoid conflicts with other app data.
 * Keys are structured as: `namespace:dataType:identifier`
 */

export const STORAGE_NAMESPACE = 'accountable.payroll' as const;

// IndexedDB configuration (used when available)
export const IDB_DATABASE_NAME = 'accountable-payroll-tool' as const;
export const IDB_STORE_NAME = 'kv' as const;
export const IDB_VERSION = 1 as const;

/**
 * Storage key functions - each returns a unique key for a specific data type
 */

/** Key for the runs index (list of all payroll runs) */
export function getRunsIndexKey(): string {
  return `${STORAGE_NAMESPACE}:runsIndex`;
}

/** Key for a specific payroll run */
export function getRunKey(runId: string): string {
  return `${STORAGE_NAMESPACE}:run:${runId}`;
}

/** Key for company defaults (settings that apply to new runs) */
export function getCompanyDefaultsKey(): string {
  return `${STORAGE_NAMESPACE}:companyDefaults`;
}

/** Key for employee directory (reusable employee data) */
export function getEmployeeDirectoryKey(): string {
  return `${STORAGE_NAMESPACE}:employeeDirectory`;
}
