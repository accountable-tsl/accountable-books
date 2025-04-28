import { PopupManager } from "@/App";
import AddBankAccount from "@/components/AddBankAccount/AddBankAccount";
import CurrentCompany from "@/components/CurrentCompany/CurrentCompany";
import Popup from "@/components/Popup/Popup";
import { AppSidebar } from "@/components/SideBar/Sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/useAuth";
import { routes } from "@/utils/routes";
import { Navigate, Outlet } from "react-router-dom";
import { HashLoader } from "react-spinners";

export default function AppLayout() {
  const { user, checkingSession } = useAuth();

  if (checkingSession) {
    return (
      <div className="flex items-center justify-center h-screen">
        <HashLoader />
      </div>
    );
  }

  if (!user) {
    return <Navigate to={routes.auth.login} replace />;
  }

  return (
    <SidebarProvider>
      <div className="page">
        <main className="main">
          <AppSidebar />
          <CurrentCompany />
          <Outlet />
        </main>

        <Popup popupId="addBankAccount">
          <AddBankAccount />
        </Popup>

        <PopupManager />
      </div>
    </SidebarProvider>
  );
}
