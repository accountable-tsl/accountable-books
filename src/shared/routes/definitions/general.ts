import { route } from "@/shared/routes/utils";

export const generalRoutes = {
  welcome: route("/welcome", { label: "Welcome" }),
  dashboard: route("/dashboard", { label: "Home" }),
  home: route("/home", { label: "Home" }),
};
