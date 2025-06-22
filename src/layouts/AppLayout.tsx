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
import { Navigate, Outlet, useParams } from "react-router-dom";
import { HashLoader } from "react-spinners";

interface AppLayoutProps extends AppSidebarProps {}
export default function AppLayout({
  sidebarCollapsible = "icon",
}: AppLayoutProps) {
  const { user, checkingSession } = useAuth();
  const { companyId, companyType, slug } = useCompany();
  const params = useParams();
  const routeCompanyId = params.companyId;

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

  if (routeCompanyId && routeCompanyId !== companyId) {
    return (
      <ErrorPage
        type="404"
        message="We couldn't find the page you were looking for"
      />
    );
  }

  return (
    <SidebarProvider defaultOpen={!sidebarCollapsed}>
      <AppSidebar sidebarCollapsible={sidebarCollapsible} />
      <SidebarInset className="flex flex-col h-dvh overflow-hidden">
        <AppHeader />

        <div className="flex-1 min-h-0">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
