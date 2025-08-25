import { AppHeader } from '@/components/AppHeader';
import { CenteredLoader } from '@/components/CenteredLoader';
import ErrorPage from '@/components/ErrorPage';
import { AppSidebar, type AppSidebarProps } from '@/components/SideBar';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { useSession } from '@/features/auth/Session';
import { useCanonicalUrlEnforcer } from '@/shared/routes/hooks';
import { pageStore, usePageMeta, useUpdatePageInfo } from '@/shared/stores/page';
import { Outlet } from 'react-router-dom';

interface AppLayoutProps extends AppSidebarProps {}
export default function AppLayout({ sidebarCollapsible = 'icon' }: AppLayoutProps) {
  const { user, company, companyId, companyType, loading } = useSession();

  useCanonicalUrlEnforcer();
  useUpdatePageInfo();
  usePageMeta();
  const { sidebarCollapsed } = pageStore();

  if (loading || sidebarCollapsed === undefined) {
    return <CenteredLoader />;
  }

  if (!user || !company || !companyId || !companyType) {
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

AppLayout.displayName = 'AppLayout';
// AppLayout.whyDidYouRender = true;
