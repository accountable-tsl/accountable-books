import { PopupManager } from "@/App";
import AddBankAccount from "@/components/AddBankAccount/AddBankAccount";
import CurrentCompany from "@/components/CurrentCompany/CurrentCompany";
import Popup from "@/components/Popup/Popup";
import { AppSidebar } from "@/components/SideBar/Sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { CompanyProvider } from "@/contexts/CompanyContext";
import { Outlet } from "react-router-dom";

export default function AppLayout() {
  return (
    <CompanyProvider>
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
    </CompanyProvider>
  );
}
