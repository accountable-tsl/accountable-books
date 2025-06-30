import { route } from "@/shared/routes/utils";

export const generalRoutes = {
  dashboard: route("/:companyId/dashboard", { label: "Home" }),
  dashboardAlias: route("/:companyId", { label: "Home" }),
  home: route("/:companyId/home", { label: "Home" }),
  homeAlias: route("/:companyId", { label: "Home" }),
};
