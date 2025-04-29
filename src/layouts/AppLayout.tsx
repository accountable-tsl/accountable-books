import { AppHeader } from "@/components/AppHeader";
import { AppSidebar, AppSidebarProps } from "@/components/SideBar/Sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/useAuth";
import { routes } from "@/shared/routes";
import {
  pageStore,
  usePageMeta,
  useUpdatePageInfo,
} from "@/shared/stores/page";
import { Navigate, Outlet, matchPath, useLocation } from "react-router-dom";
import { HashLoader } from "react-spinners";

interface AppLayoutProps extends AppSidebarProps {}
export default function AppLayout({
  sidebarCollapsible = "icon",
}: AppLayoutProps) {
  const { user, checkingSession } = useAuth();
  const { sidebarCollapsed } = pageStore();
  useUpdatePageInfo();
  usePageMeta();
  const location = useLocation();

  if (checkingSession) {
    return (
      <div className="flex items-center justify-center h-screen">
        <HashLoader />
      </div>
    );
  }

  if (!user) {
    return <Navigate to={routes.login.buildPath()} replace />;
  }

  return (
    <SidebarProvider defaultOpen={!sidebarCollapsed}>
      <AppSidebar sidebarCollapsible={sidebarCollapsible} />
      <SidebarInset>
        <AppHeader />
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  );
}
