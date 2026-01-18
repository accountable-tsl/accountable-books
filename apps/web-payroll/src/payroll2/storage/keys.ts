export const STORAGE_NAMESPACE = 'accountable.payroll2' as const;

export const IDB_DB_NAME = 'accountable-payroll-tool' as const;
export const IDB_STORE_NAME = 'kv' as const;
export const IDB_DB_VERSION = 1 as const;

export const keyCompanyDefaults = () =>
  `${STORAGE_NAMESPACE}:companyDefaults` as const;

export const keyEmployeeDirectory = () =>
  `${STORAGE_NAMESPACE}:employeeDirectory` as const;

export const keyRunsIndex = () => `${STORAGE_NAMESPACE}:runsIndex` as const;

export const keyRun = (runId: string) => `${STORAGE_NAMESPACE}:run:${runId}`;

