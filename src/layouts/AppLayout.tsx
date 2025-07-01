import { AppHeader } from "@/components/AppHeader";
import { CenteredLoader } from "@/components/CenteredLoader";
import ErrorPage from "@/components/ErrorPage";
import { AppSidebar, AppSidebarProps } from "@/components/SideBar/Sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { useCompanyDetails } from "@/domains/company/hooks";
import { useAuth, useSessionLoader } from "@/features/auth/hooks";
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
  const {
    user,
    currentCompanyId: companyId,
    companyType: authCompanyType,
    firmSlug: slug,
    isLoggedIn,
  } = useAuth();

  const { loading: sessionLoading } = useSessionLoader();

  const {
    data: companyDetails,
    isLoading: companyDetailsLoading,
    isError: companyDetailsError,
  } = useCompanyDetails(companyId || "");

  const company = companyDetails?.data;
  const { companyType } = companyDetails?.data || {};

  const { sidebarCollapsed } = pageStore();
  useCanonicalUrlEnforcer();
  useUpdatePageInfo();
  usePageMeta();

  // If we are loading the session or company details, show a loader
  if (sessionLoading || companyDetailsLoading) {
    return <CenteredLoader fullscreen />;
  }

  // We've loaded the session and confirm the user is not logged in, redirect to login
  if (!isLoggedIn && !sessionLoading) {
    return <Navigate to={routes.auth.login.staticPath} replace />;
  }

  console.log({
    company,
    user,
    companyId,
    companyType,
    slug,
    companyDetailsError,
  });
  if (
    !company ||
    !user ||
    !companyId ||
    !companyType ||
    !slug ||
    companyDetailsError ||
    authCompanyType !== companyType
  ) {
    return <ErrorPage type="default" />;
  }

  // console.log({
  //   companyDetailsLoading,
  //   companyDetailsError,
  //   isLoggedIn,
  //   user,
  //   slug,
  // });

  // if (routeCompanyId && routeCompanyId !== companyId && !isSwitching) {
  //   return (
  //     <ErrorPage
  //       type="404"
  //       message="We couldn't find the page you were looking for"
  //     />
  //   );
  // }

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
