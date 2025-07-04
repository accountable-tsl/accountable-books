import { AppHeader } from "@/components/AppHeader";
import { CenteredLoader } from "@/components/CenteredLoader";
import ErrorPage from "@/components/ErrorPage";
import { AppSidebar, AppSidebarProps } from "@/components/SideBar/Sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { useSession } from "@/features/auth/Session";
import { useCanonicalUrlEnforcer } from "@/shared/routes/hooks";
import { routes } from "@/shared/routes/routes";
import {
  pageStore,
  usePageMeta,
  useUpdatePageInfo,
} from "@/shared/stores/page";
import { Navigate, Outlet } from "react-router-dom";

interface AppLayoutProps extends AppSidebarProps {}
export default function AppLayout({
  sidebarCollapsible = "icon",
}: AppLayoutProps) {
  const { user, isLoggedIn, company, companyId, companyType, loading } =
    useSession();

  const { sidebarCollapsed } = pageStore();
  useCanonicalUrlEnforcer();
  useUpdatePageInfo();
  usePageMeta();

  // If we are loading the session or company details, show a loader
  if (loading) {
    return <CenteredLoader fullscreen />;
  }

  // We've loaded the session and confirm the user is not logged in, redirect to login
  if (!isLoggedIn) {
    return <Navigate to={routes.auth.login.staticPath} replace />;
  }

  const canAccessApp = user?.currentCompany.onboarding.canAccessApp;
  if (!canAccessApp) {
    return <Navigate to={routes.onboarding.index.staticPath} replace />;
  }

  if (
    !company ||
    !user ||
    !companyId ||
    !companyType
    //  || !slug
    // companyDetailsError ||
    // authCompanyType !== companyType
  ) {
    return <ErrorPage type="default" />;
  }

  return (
    <SidebarProvider defaultOpen={!sidebarCollapsed}>
      <AppSidebar
        sidebarCollapsible={sidebarCollapsible}
        user={user}
        company={company}
        companyId={companyId}
        companyType={companyType}
      />
      <SidebarInset className="flex flex-col h-dvh overflow-hidden">
        <AppHeader company={company} />

        <div className="flex-1 min-h-0">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

// AppLayout.whyDidYouRender = true;
