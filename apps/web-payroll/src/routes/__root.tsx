import type { QueryClient } from '@tanstack/react-query';
import { TanStackDevtools } from '@tanstack/react-devtools';
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';

import Header from '../components/Header';
import { SidebarInset } from '@/components/ui/sidebar';

interface MyRouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  component: () => (
    <SidebarInset className='overflow-hidden h-svh'>
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
