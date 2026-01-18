/**
 * Attachment limits for transaction files
 * These limits apply to files attached to ledger entries, journal entries, and bank transactions.
 */
export const TRANSACTION_FILE_LIMITS = {
  /** Maximum file size per file in MB */
  MAX_FILE_SIZE_MB: 10,
  /** Maximum number of files per entry */
  MAX_FILES_PER_ENTRY: 5,
  /** Maximum total size per entry in MB */
  MAX_TOTAL_SIZE_MB: 20,
} as const;

/**
 * Calculated byte limits (derived from MB limits)
 */
export const TRANSACTION_FILE_LIMITS_BYTES = {
  MAX_FILE_SIZE_BYTES: TRANSACTION_FILE_LIMITS.MAX_FILE_SIZE_MB * 1024 * 1024,
  MAX_TOTAL_SIZE_BYTES: TRANSACTION_FILE_LIMITS.MAX_TOTAL_SIZE_MB * 1024 * 1024,
} as const;
