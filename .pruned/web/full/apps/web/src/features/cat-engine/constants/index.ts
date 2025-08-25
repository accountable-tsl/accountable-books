// UI Constants
export const DESCRIPTION_TRUNCATE_LENGTH = 75;
export const DEFAULT_CURRENCY = 'USD';

// Animation durations (in milliseconds for CSS)
export const TRANSITION_DURATION_MS = 300;
export const ROTATION_DURATION_MS = 200;

// Default values
export const DEFAULT_FALLBACK_TEXT = '-- No description --';
export const DEFAULT_EMPTY_VALUE = '-';
export const DEFAULT_ACCOUNT_TEXT = 'Uncategorized';

// Tooltip content
export const TOOLTIPS = {
  BANK_TRANSACTION_DATE: 'Bank transaction date',
  FS_DATE: 'Date recorded in the ledger',
  DESCRIPTION: 'Description of the transaction',
  BANK_LOGO: 'Bank',
} as const;

// Validation constants
export const VALIDATION = {
  DESCRIPTION_MIN_LENGTH: 1,
  DESCRIPTION_MAX_LENGTH: 500,
  PAYEE_MAX_LENGTH: 200,
  PROJECT_MAX_LENGTH: 200,
  ACCOUNT_MAX_LENGTH: 200,
} as const;

// Error messages
export const ERROR_MESSAGES = {
  REQUIRED_FIELD: 'This field is required',
  DESCRIPTION_REQUIRED: 'Description is required',
  ACCOUNT_REQUIRED: 'Account is required',
  FS_DATE_REQUIRED: 'FS Date is required',
  DESCRIPTION_TOO_LONG: 'Description must be less than 500 characters',
  PAYEE_TOO_LONG: 'Payee must be less than 200 characters',
  PROJECT_TOO_LONG: 'Project must be less than 200 characters',
  ACCOUNT_TOO_LONG: 'Account must be less than 200 characters',
  NETWORK_ERROR: 'Network error. Please try again.',
  SAVE_ERROR: 'Failed to save changes. Please try again.',
  LOAD_ERROR: 'Failed to load transaction data.',
} as const;

// Form configuration
export const FORM_CONFIG = {
  DEBOUNCE_DELAY: 300,
  AUTO_SAVE_DELAY: 5000,
  MAX_RETRIES: 3,
} as const;
