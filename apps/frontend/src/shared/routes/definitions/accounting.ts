import { route } from "@/shared/routes/utils";

export const accounting = {
  index: route("/ws/accounting", {
    label: "Accounting Workspace",
    sidebarCollapsed: true,
  }),
  setup: route("/ws/accounting/setup", {
    label: "Accounting Setup",
  }),
  uploadBankTxn: route("/ws/accounting/upload-bank-txn", {
    label: "Upload Bank Transaction",
  }),
  transactions: route("/ws/accounting/transactions", {
    label: "Transactions",
    sidebarCollapsed: true,
  }),
  catEngine: route("/ws/accounting/cat-engine", {
    label: "Transactions",
    sidebarCollapsed: true,
  }),
  // addBankTxn: route("/ws/accounting/add-bank-txn", {
  //   label: "Add Bank Transaction",
  // }),
};
