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
  // addBankTxn: route("/ws/accounting/add-bank-txn", {
  //   label: "Add Bank Transaction",
  // }),
};
