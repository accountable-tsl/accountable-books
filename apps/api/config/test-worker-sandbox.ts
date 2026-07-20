const DEFAULT_TEST_WORKERS = 4;
const MAX_TEST_WORKERS = 8;

export function resolveVitestWorkerId(
  poolId = process.env.VITEST_POOL_ID,
): number | null {
  if (poolId == null) return null;

  const workerId = Number(poolId);
  if (
    !Number.isInteger(workerId) ||
    workerId < 1 ||
    workerId > MAX_TEST_WORKERS
  ) {
    throw new Error(
      `VITEST_POOL_ID must be between 1 and ${MAX_TEST_WORKERS}; received "${poolId}"`,
    );
  }
  return workerId;
}

export function resolveTestDatabaseName(
  baseDatabaseName: string,
  poolId = process.env.VITEST_POOL_ID,
): string {
  if (baseDatabaseName.length > 48) {
    throw new Error('POSTGRES_DB must be at most 48 characters for API tests');
  }
  const workerId = resolveVitestWorkerId(poolId);
  return `${baseDatabaseName}_test${workerId ? `_worker_${workerId}` : ''}`;
}

export function resolveTestWorkerCount(): number {
  const workerCount = Number(
    process.env.API_TEST_WORKERS ?? DEFAULT_TEST_WORKERS,
  );
  if (
    !Number.isInteger(workerCount) ||
    workerCount < 1 ||
    workerCount > MAX_TEST_WORKERS
  ) {
    throw new Error(
      `API_TEST_WORKERS must be between 1 and ${MAX_TEST_WORKERS}`,
    );
  }
  return workerCount;
}
