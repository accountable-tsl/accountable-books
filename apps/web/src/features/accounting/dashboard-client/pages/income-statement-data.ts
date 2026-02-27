/**
 * Re-exports from reporting module. Feature consumes from module for production-ready separation.
 */
export {
  DERIVED_STATEMENT_LINE_IDS,
  SECTION_LABELS,
} from '@/modules/accounting/reporting/data/income-statement-data';
export { findLineById } from '@/modules/accounting/reporting/data/statement-utils';
export type { StatementLine } from '@accountable-books/contracts/schema';
