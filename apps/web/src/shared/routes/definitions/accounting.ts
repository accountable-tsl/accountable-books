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
  catEngine: route('/ws/cat-engine', {
    label: 'Transactions',
    sidebarCollapsed: true,
  }),
  transactions: route('/ws/transactions', {
    label: 'Transactions',
    sidebarCollapsed: true,
  }),
  // addBankTxn: route("/ws/accounting/add-bank-txn", {
  //   label: "Add Bank Transaction",
  // }),
};
