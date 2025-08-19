import { MockSidebar } from '@/components/SideBar';
import { SidebarProvider } from '@/components/ui/sidebar';

export function MockDashboard({ children }: { children?: React.ReactNode }) {
  return (
    <SidebarProvider>
      <MockSidebar />
      {children}
    </SidebarProvider>
  );
}
