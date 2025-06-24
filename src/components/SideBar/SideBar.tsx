import {
  ArrowUpCircleIcon,
  AudioWaveform,
  Calendar,
  GalleryVerticalEnd,
  Home,
  Inbox,
  Search,
  Settings,
  UserIcon,
} from "lucide-react";

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
} from "@/components/ui/sidebar";
import { Link } from "react-router-dom";
import {
  getNavMain,
  getNavSecondary,
  getNavUser,
} from "@/constants/sidebarData";
import { NavMain } from "../NavMain";
import { NavUser } from "../NavUser";
import { NavSecondary } from "../NavSecondary";
import { routes } from "@/shared/routes/routes-old";
import { useAuth } from "@/features/auth/hooks";
import { useCompany } from "@/domains/company/store";
import React, { useMemo } from "react";
import { SkeletonBlock } from "../SkeletonBlock";
import { CompanyData, CompanyType } from "@/domains/company/types";
import { AuthUserContext } from "@/features/auth/types";

export interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  sidebarCollapsible?: "icon" | "offcanvas";
  defaultCollapsed?: boolean;
  companyId?: string;
  companyType?: CompanyType;
  company: CompanyData;
  user: AuthUserContext;
}

export const AppSidebar = React.memo(function AppSidebar({
  sidebarCollapsible = "icon",
  user,
  company,
  companyId: _companyId,
  companyType: _companyType,
  ...props
}: AppSidebarProps) {
  // Side bar options, depending on page, I'd use collapsible or icon
  // e.g on categorization engine, we'd use collapsible but on dashboard, we'd use icon

  const companyId = _companyId || company?.id;
  const companyType = _companyType || company?.companyType;

  const navMain = useMemo(
    () => (companyId && companyType ? getNavMain(companyId, companyType) : []),
    [companyId, companyType]
  );

  const navSecondary = useMemo(
    () =>
      companyId && companyType ? getNavSecondary(companyId, companyType) : [],
    [companyId, companyType]
  );

  const navUser = useMemo(
    () =>
      user
        ? getNavUser({
            name: user.firstname,
            email: user.email,
            avatar: "", // user.avatar or something later
          })
        : { name: "", email: "", avatar: "" },
    [user?.firstname, user?.email] // Only depend on specific fields
  );

  const dashboardPath = useMemo(
    () => (companyId ? routes.dashboard.buildPath({ companyId }) : "#"),
    [companyId]
  );

  if (!companyId || !companyType) return <SkeletonBlock />;

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
                <div className="flex items-center justify-center h-5 w-5 overflow-hidden">
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
});
export function MockSidebar(items: any[] = []) {
  return (
    <Sidebar>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Application</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.length &&
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
