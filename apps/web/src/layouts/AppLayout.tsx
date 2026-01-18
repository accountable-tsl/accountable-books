import { useSession } from '@session';
import { Outlet } from 'react-router';

import { AppHeader } from '@/components/AppHeader';
import { CenteredLoader } from '@/components/CenteredLoader';
import ErrorPage from '@/components/ErrorPage';
import type { AppSidebarProps } from '@/components/SideBar';
import { AppSidebar } from '@/components/SideBar';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { useCanonicalUrlEnforcer } from '@/shared/routes/hooks';
import {
  pageStore,
  usePageMeta,
  useUpdatePageInfo,
} from '@/shared/stores/page';

interface AppLayoutProps extends AppSidebarProps {}
export default function AppLayout({
  sidebarCollapsible = 'icon',
}: AppLayoutProps) {
  const { user, company, companyId, companyType, loading } = useSession();

  useCanonicalUrlEnforcer();
  useUpdatePageInfo();
  usePageMeta();
  const { sidebarCollapsed, setSidebarCollapsed } = pageStore();

  if (loading || sidebarCollapsed === undefined) {
    return <CenteredLoader />;
  }

  if (!user || !company || !companyId || !companyType) {
    return <ErrorPage type="default" />;
  }

  return (
    <SidebarProvider
      defaultOpen={!sidebarCollapsed}
      open={sidebarCollapsed === undefined ? undefined : !sidebarCollapsed}
      onOpenChange={(open) => setSidebarCollapsed?.(!open)}
    >
      <AppSidebar
        sidebarCollapsible={sidebarCollapsible}
        user={user}
        company={company}
        companyId={companyId}
        companyType={companyType}
      />
      <SidebarInset className="flex h-dvh flex-col overflow-hidden">
        <AppHeader company={company} />

        <div className="min-h-0 flex-1">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

AppLayout.displayName = 'AppLayout';
// AppLayout.whyDidYouRender = true;
