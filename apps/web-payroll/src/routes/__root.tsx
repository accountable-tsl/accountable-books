import type { QueryClient } from '@tanstack/react-query';
import { SidebarInset } from '@/components/ui/sidebar';
import { TanStackDevtools } from '@tanstack/react-devtools';
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';

import Header from '../components/Header';

interface MyRouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  component: () => (
    <SidebarInset className="h-svh overflow-hidden">
      <Header />
      <Outlet />
      <TanStackDevtools
        config={{
          position: 'bottom-right',
        }}
        // plugins={[
        //   {
        //     name: 'Tanstack Router',
        //     render: <TanStackRouterDevtoolsPanel />,
        //   },
        //   TanStackQueryDevtools,
        // ]}
      />
    </SidebarInset>
  ),
});
