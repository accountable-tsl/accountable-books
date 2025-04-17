import { AuthHeader } from "@/components/Header/AuthHeader";
import { Outlet } from "react-router-dom";

export default function AuthLayout() {
  return (
    <div className="flex flex-col min-h-svh">
      <AuthHeader />
      <Outlet />
    </div>
  );
}
