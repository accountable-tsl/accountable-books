import { route } from "@/shared/routes/utils";

export const authRoutes = {
  login: route("/login", { public: true, label: "Login" }),
  logout: route("/logout", { public: true, label: "Logout" }),
  signup: route("/signup", { public: true, label: "Sign Up" }),
  forgotPassword: route("/forgot-password", {
    public: true,
    label: "Forgot Password",
  }),
};
