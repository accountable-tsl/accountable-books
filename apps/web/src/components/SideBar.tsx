import type { CompanyData, CompanyType } from '@/modules/company/companies';
import React from 'react';
import { NavMain } from '@/components/NavMain';
import { NavSecondary } from '@/components/NavSecondary';
import { NavUser } from '@/components/NavUser';
import { SkeletonBlock } from '@/components/SkeletonBlock';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import {
  getNavMain,
  getNavSecondary,
  getNavUser,
} from '@/constants/sidebarData';
import { type AuthUserContext } from '@/modules/auth';
import { routes } from '@/shared/routes';
import { ArrowUpCircleIcon } from 'lucide-react';
import { Link } from 'react-router';

export interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  sidebarCollapsible?: 'icon' | 'offcanvas';
  defaultCollapsed?: boolean;
  companyId?: string;
  companyType?: CompanyType;
  company?: CompanyData;
  user?: AuthUserContext;
}

export const AppSidebar = ({
  sidebarCollapsible = 'icon',
  user,
  company,
  companyId: _companyId,
  companyType: _companyType,
  ...props
}: AppSidebarProps) => {
  // Side bar options, depending on page, I'd use collapsible or icon
  // e.g on categorization engine, we'd use collapsible but on dashboard, we'd use icon

  const companyId = _companyId || company?.id;
  const companyType = _companyType || company?.companyType;

  const navMain =
    companyId && companyType ? getNavMain(companyId, companyType) : [];
  const navSecondary = companyId && companyType ? getNavSecondary() : [];

  const navUser = user
    ? getNavUser({
        name: user.firstname,
        email: user.email,
        avatar: '', // user.avatar or something later
      })
    : { name: '', email: '', avatar: '' };

  const dashboardPath = routes.general.dashboard.build({
    companyId: companyId || '',
  });

  if (!companyId || !companyType || !company)
    return <SkeletonBlock className="max-w-5xl" />;

  return (
    <Sidebar collapsible={sidebarCollapsible} {...props}>
      <SidebarHeader className="h-12 md:border-b">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:!p-1.5"
            >
              <Link to={dashboardPath} className="flex items-center gap-2">
                <div className="flex h-5 w-5 items-center justify-center overflow-hidden">
                  {company?.assignedFirmLogo ? (
                    <img
                      src={company?.assignedFirmLogo}
                      alt={`${company?.assignedFirmName} Logo`}
                    />
                  ) : (
                    <ArrowUpCircleIcon />
                  )}
                </div>
                <span className="truncate text-sm font-medium">
                  {company?.assignedFirmName}
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navMain} />
        <NavSecondary items={navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={navUser} />
      </SidebarFooter>
    </Sidebar>
  );
};
export function MockSidebar({ items = [] }: Partial<{ items: any[] }>) {
  return (
    <Sidebar className="fixed top-0 left-0 z-0 h-full shadow-md">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Onboarding Suite</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.length > 0 &&
                items.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <a href={item.url}>
                        <item.icon />
                        <span>{item.title}</span>
                      </a>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
