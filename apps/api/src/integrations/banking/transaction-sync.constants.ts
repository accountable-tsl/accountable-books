export const BANK_ACCOUNT_SYNC_LOCK_TTL_SECONDS = 30 * 60;
export const BANK_ACCOUNT_SYNC_JOB_ATTEMPTS = 8;
export const BANK_ACCOUNT_SYNC_JOB_BACKOFF = {
  type: 'exponential' as const,
  delay: 30000,
};

// Observability thresholds only; synchronization remains lossless above them.
export const BANK_ACCOUNT_SYNC_BUFFER_WARNING_TRANSACTIONS = 5000;
export const BANK_ACCOUNT_SYNC_BUFFER_WARNING_BYTES = 25 * 1024 * 1024;
