import type { Knex } from 'knex';

/**
 * Acquire advisory transaction-level locks in a deterministic order to avoid
 * deadlocks caused by lock-order inversion.
 */
export async function acquireAdvisoryXactLocks(
  trx: Knex.Transaction,
  keys: string[],
  options?: { maxAttempts?: number; baseDelayMs?: number },
): Promise<void> {
  const { maxAttempts = 10, baseDelayMs = 25 } = options ?? {};
  const sorted = Array.from(new Set(keys)).sort();

  for (const key of sorted) {
    let attempt = 0;
    while (true) {
      const result = await trx.raw(
        'SELECT pg_try_advisory_xact_lock(hashtext(?)) AS locked',
        [key],
      );
      const locked =
        (result as { rows?: Array<{ locked?: boolean }> })?.rows?.[0]?.locked ??
        (result as { rows?: Array<{ pg_try_advisory_xact_lock?: boolean }> })
          ?.rows?.[0]?.pg_try_advisory_xact_lock ??
        false;

      if (locked) break;

      attempt += 1;
      if (attempt >= maxAttempts) {
        throw new Error(`Failed to acquire advisory lock: ${key}`);
      }
      await sleep(baseDelayMs * attempt * attempt);
    }
  }
}

/**
 * Single, non-blocking attempt to take a transaction-level advisory lock.
 * Returns whether the lock was acquired. Unlike {@link acquireAdvisoryXactLocks}
 * this never retries and never throws on contention, so callers can implement
 * "try briefly, otherwise defer" semantics (see the materializer concurrency
 * model: an inline materializer that cannot get the scope lock returns a
 * refetch hint and lets the outbox worker finish reconciliation).
 */
export async function tryAcquireAdvisoryXactLock(
  trx: Knex.Transaction,
  key: string,
): Promise<boolean> {
  const result = await trx.raw(
    'SELECT pg_try_advisory_xact_lock(hashtext(?)) AS locked',
    [key],
  );
  return (
    (result as { rows?: Array<{ locked?: boolean }> })?.rows?.[0]?.locked ??
    (result as { rows?: Array<{ pg_try_advisory_xact_lock?: boolean }> })
      ?.rows?.[0]?.pg_try_advisory_xact_lock ??
    false
  );
}

/**
 * Try to acquire a transaction-level advisory lock with a small bounded number
 * of attempts. Returns true once held (released automatically at transaction
 * end) or false if it could not be acquired within the attempt budget. Used by
 * the work materializer to serialize per-scope reconciliation without blocking
 * the request path indefinitely.
 */
export async function tryAcquireAdvisoryXactLockWithBackoff(
  trx: Knex.Transaction,
  key: string,
  options?: { maxAttempts?: number; baseDelayMs?: number },
): Promise<boolean> {
  const { maxAttempts = 5, baseDelayMs = 25 } = options ?? {};
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (await tryAcquireAdvisoryXactLock(trx, key)) {
      return true;
    }
    if (attempt < maxAttempts) {
      await sleep(baseDelayMs * attempt);
    }
  }
  return false;
}

export function isDeadlockError(error: unknown): boolean {
  const err = error as { code?: string; message?: string };
  return (
    err?.code === '40P01' ||
    (typeof err?.message === 'string' &&
      (err.message.toLowerCase().includes('deadlock detected') ||
        err.message.toLowerCase().includes('failed to acquire advisory lock')))
  );
}

export async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function acquireAdvisoryXactLockPair(
  trx: Knex.Transaction,
  k1: number,
  k2: number,
  options?: { maxAttempts?: number; baseDelayMs?: number },
): Promise<void> {
  const { maxAttempts = 10, baseDelayMs = 25 } = options ?? {};
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = await trx.raw(
      'SELECT pg_try_advisory_xact_lock(?, ?) AS locked',
      [k1, k2],
    );
    const locked =
      (result as { rows?: Array<{ locked?: boolean }> })?.rows?.[0]?.locked ??
      false;
    if (locked) return;
    await sleep(baseDelayMs * attempt * attempt);
  }
  throw new Error(`Failed to acquire advisory lock pair: (${k1}, ${k2})`);
}

// =============================================================================
// Canonical lock key helpers (string keys, deterministic ordering)
// =============================================================================

export function lockKeyCompany(companyId: string): string {
  return `company:${companyId}`;
}

export function lockKeyBankTxn(sourceTxId: string): string {
  return `bank_txn:${sourceTxId}`;
}

export function lockKeyJournalBatch(sourceTxId: string): string {
  return `journal_batch:${sourceTxId}`;
}

export function lockKeyCategorizationIntent(bankTxnId: string): string {
  return `cat_intent:${bankTxnId}`;
}

export function lockKeyCategorizationTask(taskId: string): string {
  return `cat_task:${taskId}`;
}

export function lockKeyFiscalCalendar(
  companyId: string,
  periodType: string,
): string {
  return `fiscal:${companyId}:${periodType}`;
}

export function lockKeyGlBalance(companyId: string, coaId: string): string {
  return `gl_balance:${companyId}:${coaId}`;
}

/**
 * Lock key serializing work materialization for one scope. The `scopeKey`
 * argument is the canonical materializer scope string
 * (e.g. `bank_account:{clientCompanyId}:{bankAccountId}`), so inline fast
 * materialization and the outbox worker contend on the same lock.
 */
export function lockKeyMaterializerScope(scopeKey: string): string {
  return `materializer:${scopeKey}`;
}
