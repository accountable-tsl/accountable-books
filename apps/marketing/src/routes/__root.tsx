import { ThemeProvider } from '@/components/theme-provider';
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
} from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';

import '../index.css';

import { Header } from '@/components/header';

export interface RouterAppContext {}

export const Route = createRootRouteWithContext<RouterAppContext>()({
  component: RootComponent,
  head: () => ({
    meta: [
      {
        title: 'Accountable',
      },
      {
        name: 'description',
        content:
          'Automated bookkeeping and tax workflows built on a ledger-first approach. Join the waitlist for early access.',
      },
    ],
    links: [{ rel: 'icon', href: '/favicon.ico' }],
  }),
});

function RootComponent() {
  return (
    <>
      <HeadContent />
      <ThemeProvider>
        <div className="grid h-svh grid-rows-[auto_1fr]">
          <Header />
          <Outlet />
        </div>
      </ThemeProvider>
      <TanStackRouterDevtools position="bottom-left" />
    </>
  );
}
