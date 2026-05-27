import { route } from '../route-factory';

export const accounting = {
  index: route('/accounting', {
    label: 'Accounting Workspace',
    sidebarCollapsed: true,
  }),
  trialBalance: route('/accounting/trial-balance', {
    label: 'Trial Balance',
    sidebarCollapsed: true,
  }),
  ledger: route('/accounting/ledger', {
    label: 'Ledger',
    sidebarCollapsed: true,
  }),
  notes: route('/accounting/notes', {
    label: 'Notes',
    sidebarCollapsed: true,
  }),
  setup: route('/ws/accounting/setup', {
    label: 'Accounting Setup',
  }),
  // uploadBankTxn: route('/ws/accounting/upload-bank-txn', {
  //   label: 'Upload Bank Transaction',
  // }),
  catEngine: route('/accounting/cat-engine', {
    label: 'Transactions',
    sidebarCollapsed: true,
  }),

  transactions: route('/accounting/transactions', {
    label: 'Transactions',
    sidebarCollapsed: true,
  }),

  journals: route('/accounting/journals', {
    label: 'Journals',
    sidebarCollapsed: true,
  }),
  journalsRecurring: route('/accounting/journals/recurring', {
    label: 'Recurring Journals',
    sidebarCollapsed: true,
  }),
  journalsImport: route('/accounting/journals/import', {
    label: 'Import Journals',
    sidebarCollapsed: true,
  }),
  // addBankTxn: route("/ws/accounting/add-bank-txn", {
  //   label: "Add Bank Transaction",
  // }),
};
