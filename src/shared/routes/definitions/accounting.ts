import { route } from "@/shared/routes/utils";

export const accounting = {
  index: route("/ws/accounting", {
    label: "Accounting Workspace",
    sidebarCollapsed: true,
  }),
  setup: route("/ws/accounting/setup", {
    label: "Accounting Setup",
  }),
};
