import { route } from '../route-factory';

export const accounting = {
  index: route('/ws/accounting', {
    label: 'Accounting Workspace',
    sidebarCollapsed: true,
  }),
  setup: route('/ws/accounting/setup', {
    label: 'Accounting Setup',
  }),
  // uploadBankTxn: route('/ws/accounting/upload-bank-txn', {
  //   label: 'Upload Bank Transaction',
  // }),
  catEngine: route('/ws/accounting/cat-engine', {
    label: 'Transactions',
    sidebarCollapsed: true,
  }),

  transactions: route('/ws/accounting/transactions', {
    label: 'Transactions',
    sidebarCollapsed: true,
  }),

  journals: route('/ws/accounting/journals', {
    label: 'Journals',
    sidebarCollapsed: true,
  }),
  journalsRecurring: route('/ws/accounting/journals/recurring', {
    label: 'Recurring Journals',
    sidebarCollapsed: true,
  }),
  journalsImport: route('/ws/accounting/journals/import', {
    label: 'Import Journals',
    sidebarCollapsed: true,
  }),
  // addBankTxn: route("/ws/accounting/add-bank-txn", {
  //   label: "Add Bank Transaction",
  // }),
};
