import { route } from "@/shared/routes/utils";

export const accounting = {
  index: route("/ws/accounting", {
    label: "Accounting Workspace",
  }),
  setup: route("/ws/accounting/setup", {
    label: "Accounting Setup",
  }),
  coa: route("/ws/accounting/setup/coa", {
    label: "Chart of Accounts",
  }),
};
