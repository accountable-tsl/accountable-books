import { AuthHeader } from "@/components/Header/AuthHeader";
import { Outlet } from "react-router-dom";

export default function AuthLayout() {
  return (
    <div className="bg-muted">
      <AuthHeader />
      <Outlet />
    </div>
  );
}
