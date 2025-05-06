import { MockSidebar } from "@/components/SideBar/Sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";

export function MockDashboard() {
  return (
    <SidebarProvider>
      <MockSidebar />
    </SidebarProvider>
  );
}
