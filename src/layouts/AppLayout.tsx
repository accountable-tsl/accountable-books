import { AppHeader } from "@/components/AppHeader";
import ErrorPage from "@/components/ErrorPage";
import { AppSidebar, AppSidebarProps } from "@/components/SideBar/Sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { useCompany } from "@/domains/company/store";
import { useAuth } from "@/features/auth/hooks";
import { routes } from "@/shared/routes/routes";
import {
  pageStore,
  usePageMeta,
  useUpdatePageInfo,
} from "@/shared/stores/page";
import { useEffect } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { HashLoader } from "react-spinners";

interface AppLayoutProps extends AppSidebarProps {}
export default function AppLayout({
  sidebarCollapsible = "icon",
}: AppLayoutProps) {
  const { user, checkingSession } = useAuth();
  const { companyId, companyType, slug } = useCompany();
  const { sidebarCollapsed } = pageStore();
  useUpdatePageInfo();
  usePageMeta();

  useEffect(() => {
    if (user && companyId && slug) {
      const isCorrectSubdomain = window.location.hostname.startsWith(slug);
      if (!isCorrectSubdomain) {
        const url = routes.dashboard.buildUrl({ companyId });
        if (url) window.location.href = url;
      }
    }
  }, [user, companyId, slug]);

  if (checkingSession) {
    return (
      <div className="flex items-center justify-center h-screen">
        <HashLoader />
      </div>
    );
  }

  if (!user) {
    return <Navigate to={routes.login.staticPath} replace />;
  }

  if (!companyId || !companyType || !slug) {
    return <ErrorPage type="default" />;
  }
  console.log("AppLayout rendered on:", window.location.pathname);

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
