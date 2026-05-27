import { cn } from '@/lib/utils';
import { ChevronLeft } from 'lucide-react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';

import { useSettingsNav } from '../config/settings-sections';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    isActive
      ? 'bg-muted font-medium text-foreground'
      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
  );

export function SettingsLayout() {
  const nav = useSettingsNav();
  const location = useLocation();

  if (!nav) return null;

  const { sections, hubHref } = nav;
  const isHubPage =
    location.pathname.endsWith('/settings') ||
    location.pathname.endsWith('/settings/');

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-7xl flex-1 flex-col px-4 py-6 sm:px-6 lg:px-8">
      <header
        className={cn(
          'border-border/60 mb-2 shrink-0 border-b pb-2',
          !isHubPage && 'hidden lg:block',
        )}
      >
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-0.5 text-xs sm:text-sm">
          Manage your workspace and team preferences.
        </p>
      </header>

      <div className="grid overflow-hidden lg:h-full lg:max-h-full lg:grid-cols-[150px_minmax(0,1fr)] lg:gap-0 lg:pt-4">
        <nav
          aria-label="Settings sections"
          className="hidden lg:sticky lg:top-4 lg:flex lg:flex-col lg:gap-1 lg:self-start lg:pr-4"
        >
          {sections.map((section) => (
            <NavLink
              key={section.id}
              to={section.href}
              className={navLinkClass}
              end={section.id !== 'company'}
            >
              {section.title}
            </NavLink>
          ))}
        </nav>

        <div className="lg:border-border/60 flex h-full min-h-0 min-w-0 flex-1 flex-col lg:border-l lg:pl-6">
          {!isHubPage && (
            <div className="mb-4 lg:hidden">
              <Link
                to={hubHref}
                className="text-muted-foreground hover:text-foreground focus-visible:ring-ring focus-visible:ring-offset-background inline-flex items-center rounded-sm text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
              >
                <ChevronLeft className="mr-1 size-4 shrink-0" aria-hidden />
                Settings
              </Link>
            </div>
          )}

          <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden text-sm">
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  );
}
