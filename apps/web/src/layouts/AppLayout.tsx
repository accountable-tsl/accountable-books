import type { AppSidebarProps } from '@/components/app-sidebar';
import { AppSidebar } from '@/components/app-sidebar';
import { AppHeader } from '@/components/AppHeader';
import { CenteredLoader } from '@/components/CenteredLoader';
import ErrorPage from '@/components/ErrorPage';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { AiRuntimeProvider } from '@/modules/ai';
import { useCanonicalUrlEnforcer } from '@/shared/routes/hooks';
import {
  pageStore,
  usePageMeta,
  useUpdatePageInfo,
} from '@/shared/stores/page';
import { useSession } from '@session';
import { Outlet } from 'react-router';

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
    <AiRuntimeProvider userId={user.id} companyId={companyId}>
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
        <SidebarInset className="flex h-dvh flex-col overflow-hidden text-sm">
          <AppHeader company={company} />

          <div className="min-h-0 flex-1 text-sm">
            <Outlet />
          </div>
        </SidebarInset>
      </SidebarProvider>
    </AiRuntimeProvider>
  );
}

AppLayout.displayName = 'AppLayout';
// AppLayout.whyDidYouRender = true;
