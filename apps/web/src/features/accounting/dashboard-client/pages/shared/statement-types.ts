// ---------------------------------------------------------------------------
// Shared statement types — used by income statement, balance sheet, etc.
// ---------------------------------------------------------------------------

/** Reconciliation state for account-level lines (child rows). */
export type ReconciliationStatus = 'reconciled' | 'pending' | 'unreconciled';

export type StatementLine = {
  id: string;
  label: string;
  amount: number;
  compareAmount: number;
  tone?: 'normal' | 'subtotal' | 'total';
  reconciliationStatus?: ReconciliationStatus;
  code?: string;
  children?: StatementLine[];
};

/** A period-specific note attached to a statement line. */
export type StatementNote = {
  lineId: string;
  body: string;
  /** 'ai' = auto-generated, 'human' = manually written, 'ai_edited' = auto-generated then edited */
  source: 'ai' | 'human' | 'ai_edited';
  updatedAt: string;
  /** Display name of last editor; null for pure auto-generated notes */
  updatedBy: string | null;
};

/** DTO shape for attachments (backend: file_attachments + files). */
export type DetailAttachment = {
  id: string;
  name: string;
  url?: string;
};

/** DTO shape for audit trail (backend: ledger_audit_logs). */
export type DetailAuditEvent = {
  id: string;
  eventType: string;
  actorName: string;
  actorType: 'user' | 'system';
  timestamp: string;
  comment?: string;
};

/** DTO for a transaction in the Details panel (backend contract for "transactions for statement line"). */
export type DetailTransaction = {
  id: string;
  date: string;
  description: string;
  source: 'bank' | 'journal';
  amount: number;
  /** Account this transaction posts to (from COA). */
  account: { code: string; label: string };
  /** Optional; empty array = none. */
  attachments?: DetailAttachment[];
  /** Optional; chronological (e.g. newest first). */
  auditEvents?: DetailAuditEvent[];
  /** Direction: Debit or Credit */
  drCr: 'Dr' | 'Cr';
};
